import express, { Express } from "express";
import cors from "cors";
import multer from "multer";
import { parsePdfNubank } from "./parsers/parsePdfNubank";
import { parseCsvNubank } from "./parsers/parseCsvNubank";
import { parseExtratoPdf } from "./parsers/parseExtratoPdf";
import { parseExtratoCsv } from "./parsers/parseExtratoCsv";
import type { ParsedTransaction } from "./parsers/types";
import { prisma } from "./db";
import { categorizeTransactions } from "./ai/gemini";
import { generateDiagnosis } from "./ai/generateDiagnosis";
import { getNextQuestion, type QuestionnaireMessage } from "./ai/questionnaire";
import { computeTotals } from "./diagnosis/totals";
import { extractRendaInformada } from "./diagnosis/income";

const SOURCES: ParsedTransaction["source"][] = ["CREDIT_CARD", "BANK"];

/** Estado do questionário derivado do histórico (reusado quando há corrida de escrita). */
function questionnaireState(history: QuestionnaireMessage[]) {
  const turn = history.filter((m) => m.role === "ai").length;
  if (history.some((m) => m.done)) return { question: null, done: true, turn };
  const lastAi = [...history].reverse().find((m) => m.role === "ai" && m.text);
  return { question: lastAi?.text ?? null, done: false, turn };
}

/** Relê o histórico atual do questionário (após uma corrida detectada). */
async function freshQuestionnaire(id: string): Promise<QuestionnaireMessage[]> {
  const d = await prisma.diagnosis.findUnique({ where: { id }, select: { questionnaire: true } });
  return Array.isArray(d?.questionnaire) ? (d!.questionnaire as QuestionnaireMessage[]) : [];
}

// Upload em memória: o parser trabalha sobre o buffer, nada é gravado em disco.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB por arquivo
});

/**
 * Monta o app Express (middlewares + rotas) SEM subir o servidor.
 * Separado de server.ts pra poder ser importado em testes/scripts.
 */
export function createApp(): Express {
  const app = express();

  // CORS: o front (Vercel) chama a API (Railway) de outro domínio.
  // Sem WEB_ORIGIN definido, libera qualquer origem (app público, sem cookie/login).
  // Defina WEB_ORIGIN (1+ origens separadas por vírgula) para restringir em produção.
  const allowed = process.env.WEB_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);
  app.use(cors({ origin: allowed && allowed.length > 0 ? allowed : true }));

  app.use(express.json());

  // Checkpoint do passo 2: prova que o servidor está de pé.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "diagnostico-express-api" });
  });

  /**
   * Passo 6 + 8: recebe um PDF (fatura) ou CSV (extrato), parseia DETERMINISTICAMENTE
   * e PERSISTE as transações num Diagnosis.
   *
   * Campos (multipart/form-data):
   *  - file        (obrigatório) o PDF ou CSV
   *  - source      (obrigatório) "CREDIT_CARD" | "BANK" — quem decide é o frontend,
   *                porque o conteúdo sozinho não distingue fatura de extrato
   *  - diagnosisId (opcional)    anexa a um Diagnosis existente (ex: cartão + extrato
   *                              na mesma sessão); se ausente, cria um novo
   */
  app.post("/upload", upload.single("file"), async (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "Envie um arquivo no campo 'file'." });
    }

    const source = req.body?.source as ParsedTransaction["source"] | undefined;
    if (!source || !SOURCES.includes(source)) {
      return res.status(400).json({ error: `Campo 'source' obrigatório: ${SOURCES.join(" ou ")}.` });
    }

    const diagnosisIdFromBody = req.body?.diagnosisId as string | undefined;
    if (!diagnosisIdFromBody) {
      // Primeiro upload da sessão — nome e email são obrigatórios
      const leadName = req.body?.leadName as string | undefined;
      const leadEmail = req.body?.leadEmail as string | undefined;
      if (!leadName?.trim()) {
        return res.status(400).json({ error: "Campo 'leadName' é obrigatório." });
      }
      if (!leadEmail?.trim()) {
        return res.status(400).json({ error: "Campo 'leadEmail' é obrigatório." });
      }
    }

    const name = file.originalname.toLowerCase();
    const isPdf = name.endsWith(".pdf") || file.mimetype === "application/pdf";
    const isCsv = name.endsWith(".csv") || file.mimetype === "text/csv";
    if (!isPdf && !isCsv) {
      return res.status(415).json({ error: "Formato não suportado. Envie PDF ou CSV." });
    }

    try {
      // source escolhe a família de parser; a extensão escolhe PDF vs CSV.
      let transactions: ParsedTransaction[];
      if (source === "BANK") {
        transactions = isPdf
          ? await parseExtratoPdf(file.buffer)
          : parseExtratoCsv(file.buffer.toString("utf-8"));
      } else {
        transactions = isPdf
          ? await parsePdfNubank(file.buffer, source)
          : parseCsvNubank(file.buffer.toString("utf-8"), source);
      }

      // Transações no formato do Prisma (id definitivo = cuid gerado no banco).
      const data = transactions.map((t) => ({
        rawLine: t.rawLine,
        date: t.date,
        description: t.description,
        amount: t.amount,
        source: t.source,
        // category fica null — só o LLM categoriza
      }));

      const diagnosisId = diagnosisIdFromBody;
      const leadName = req.body?.leadName as string | undefined;
      const leadEmail = req.body?.leadEmail as string | undefined;

      if (diagnosisId) {
        const exists = await prisma.diagnosis.findFirst({
          where: { id: diagnosisId, deletedAt: null },
          select: { id: true },
        });
        if (!exists) {
          return res.status(404).json({ error: "diagnosisId não encontrado." });
        }
        await prisma.transaction.createMany({
          data: data.map((d) => ({ ...d, diagnosisId })),
        });
        const saved = await prisma.transaction.findMany({
          where: { diagnosisId },
          orderBy: { date: "asc" },
        });
        return res.status(200).json({ diagnosisId, count: saved.length, transactions: saved });
      }

      const diagnosis = await prisma.diagnosis.create({
        data: {
          leadName: leadName || null,
          leadEmail: leadEmail || null,
          transactions: { create: data },
        },
        include: { transactions: { orderBy: { date: "asc" } } },
      });
      return res.status(201).json({
        diagnosisId: diagnosis.id,
        count: diagnosis.transactions.length,
        transactions: diagnosis.transactions,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao processar o arquivo.";
      return res.status(422).json({ error: message });
    }
  });

  /**
   * Passo 10: categoriza as transações de um Diagnosis com o LLM e grava o
   * `category` de cada uma. O LLM só classifica; os totais são calculados em
   * código (Regra de Ouro). Idempotente: re-rodar recategoriza tudo.
   */
  app.post("/diagnoses/:id/categorize", async (req, res) => {
    const { id } = req.params;
    try {
      const diagnosis = await prisma.diagnosis.findFirst({
        where: { id, deletedAt: null },
        select: { leadName: true },
      });
      const txs = await prisma.transaction.findMany({
        where: { diagnosisId: id, diagnosis: { deletedAt: null } },
        orderBy: { date: "asc" },
      });
      if (!diagnosis || txs.length === 0) {
        return res.status(404).json({ error: "Diagnosis sem transações ou inexistente." });
      }

      const cats = await categorizeTransactions(
        txs.map((t) => ({
          id: t.id,
          description: t.description,
          amount: Number(t.amount),
          source: t.source,
        })),
        diagnosis.leadName ?? undefined,
      );
      const byId = new Map(cats.map((c) => [c.id, c.category]));

      // Grava as categorias atomicamente.
      await prisma.$transaction(
        txs.map((t) =>
          prisma.transaction.update({
            where: { id: t.id },
            data: { category: byId.get(t.id) ?? null },
          }),
        ),
      );

      const updated = await prisma.transaction.findMany({
        where: { diagnosisId: id },
        orderBy: { date: "asc" },
      });
      return res.json({
        diagnosisId: id,
        count: updated.length,
        totals: computeTotals(updated),
        transactions: updated,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao categorizar.";
      return res.status(502).json({ error: message });
    }
  });

  /**
   * Passo 12: questionário dinâmico guiado por IA.
   *
   * POST /diagnoses/:id/questionnaire
   * body: { answer?: string, skip?: boolean }
   *
   * - Primeira chamada: body vazio ou sem "answer" → LLM gera a primeira pergunta
   * - Chamadas seguintes: { answer: "resposta do lead" } → LLM decide próxima pergunta ou encerra
   * - { skip: true } → encerra imediatamente sem chamar o LLM (lead não quer responder)
   *
   * Resposta: { question: string | null, done: boolean, turn: number }
   */
  app.post("/diagnoses/:id/questionnaire", async (req, res) => {
    const { id } = req.params;
    const { answer, skip } = req.body as { answer?: string; skip?: boolean };

    try {
      const diagnosis = await prisma.diagnosis.findFirst({
        where: { id, deletedAt: null },
        include: { transactions: true },
      });

      if (!diagnosis) {
        return res.status(404).json({ error: "Diagnosis não encontrado." });
      }

      // Versão lida — usada como guard de concorrência otimista na escrita.
      const expectedUpdatedAt = diagnosis.updatedAt;
      const history: QuestionnaireMessage[] = Array.isArray(diagnosis.questionnaire)
        ? (diagnosis.questionnaire as QuestionnaireMessage[])
        : [];

      // Já encerrado
      if (history.some((m) => m.done)) {
        return res.json(questionnaireState(history));
      }

      // Grava SÓ se ninguém alterou o questionário desde a leitura (where: updatedAt).
      // Em corrida, count = 0 → relê e devolve o estado atual, sem duplicar/embaralhar.
      const commit = async (finalHistory: QuestionnaireMessage[]) => {
        const saved = await prisma.diagnosis.updateMany({
          where: { id, updatedAt: expectedUpdatedAt },
          data: { questionnaire: finalHistory },
        });
        if (saved.count === 0) return questionnaireState(await freshQuestionnaire(id));
        return questionnaireState(finalHistory);
      };

      // Lead optou por pular
      if (skip) {
        return res.json(await commit([...history, { role: "ai", text: null, done: true }]));
      }

      // Anexa a resposta do lead ao histórico (se houver)
      const historyWithAnswer: QuestionnaireMessage[] =
        answer?.trim()
          ? [...history, { role: "user" as const, text: answer.trim() }]
          : history;

      // Monta o resumo condensado das transações para o LLM
      const totals = computeTotals(diagnosis.transactions);
      const rendaDescricoes = diagnosis.transactions
        .filter((t) => t.category === "Renda")
        .map((t) => t.description);
      const summary = { totais: totals, rendaDescricoes, despesaPorCategoria: totals.despesaPorCategoria };

      const { question, done } = await getNextQuestion(summary, historyWithAnswer);

      const finalHistory: QuestionnaireMessage[] = done
        ? [...historyWithAnswer, { role: "ai", text: null, done: true }]
        : [...historyWithAnswer, { role: "ai", text: question }];

      return res.json(await commit(finalHistory));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha no questionário.";
      return res.status(502).json({ error: message });
    }
  });

  /**
   * Passo 11: gera o diagnóstico completo (5 seções) via Gemini.
   * Pré-condição: todas as transações já devem ter category (rode /categorize antes).
   * Os totais são calculados em código e enviados prontos ao LLM — ele só narra e cita ids.
   */
  app.post("/diagnoses/:id/generate", async (req, res) => {
    const { id } = req.params;
    try {
      const diagnosis = await prisma.diagnosis.findFirst({
        where: { id, deletedAt: null },
        include: { transactions: { orderBy: { date: "asc" } } },
      });

      if (!diagnosis) {
        return res.status(404).json({ error: "Diagnosis não encontrado." });
      }

      const uncategorized = diagnosis.transactions.filter((t) => !t.category);
      if (uncategorized.length > 0) {
        return res.status(400).json({
          error: `${uncategorized.length} transação(ões) sem categoria. Rode POST /diagnoses/${id}/categorize primeiro.`,
        });
      }

      await prisma.diagnosis.update({
        where: { id },
        data: { status: "PROCESSING" },
      });

      const totals = computeTotals(diagnosis.transactions);

      const txsForLlm = diagnosis.transactions.map((t) => ({
        id: t.id,
        date: t.date.toISOString().slice(0, 10),
        description: t.description,
        amount: Number(t.amount),
        source: t.source as "CREDIT_CARD" | "BANK",
        category: t.category!,
      }));

      const rendaInformada = extractRendaInformada(diagnosis.questionnaire);
      const result = await generateDiagnosis(
        txsForLlm,
        totals,
        diagnosis.questionnaire ?? undefined,
        rendaInformada,
      );

      await prisma.diagnosis.update({
        where: { id },
        data: { status: "DONE", result: result as object },
      });

      return res.json({ diagnosisId: id, result });
    } catch (err) {
      await prisma.diagnosis.update({
        where: { id: req.params.id },
        data: {
          status: "ERROR",
          errorMsg: err instanceof Error ? err.message : "Falha ao gerar diagnóstico.",
        },
      });
      const message = err instanceof Error ? err.message : "Falha ao gerar diagnóstico.";
      return res.status(502).json({ error: message });
    }
  });

  /**
   * Passo 15: estado atual de um Diagnosis para o frontend decidir a tela
   * (questionário vs relatório) com base no `status`.
   */
  app.get("/diagnoses/:id", async (req, res) => {
    const { id } = req.params;
    const diagnosis = await prisma.diagnosis.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        status: true,
        result: true,
        errorMsg: true,
        questionnaire: true,
        transactions: {
          select: { id: true, date: true, description: true, amount: true, source: true, category: true },
          orderBy: { date: "asc" },
        },
      },
    });
    if (!diagnosis) {
      return res.status(404).json({ error: "Diagnosis não encontrado." });
    }
    return res.json(diagnosis);
  });

  return app;
}
