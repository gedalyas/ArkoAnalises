import express, { Express } from "express";
import multer from "multer";
import { parsePdfNubank } from "./parsers/parsePdfNubank";
import { parseCsvNubank } from "./parsers/parseCsvNubank";
import { parseExtratoPdf } from "./parsers/parseExtratoPdf";
import { parseExtratoCsv } from "./parsers/parseExtratoCsv";
import type { ParsedTransaction } from "./parsers/types";
import { prisma } from "./db";
import { categorizeTransactions } from "./ai/gemini";
import { computeTotals } from "./diagnosis/totals";

const SOURCES: ParsedTransaction["source"][] = ["CREDIT_CARD", "BANK"];

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

      const diagnosisId = req.body?.diagnosisId as string | undefined;

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
        data: { transactions: { create: data } },
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
      const txs = await prisma.transaction.findMany({
        where: { diagnosisId: id, diagnosis: { deletedAt: null } },
        orderBy: { date: "asc" },
      });
      if (txs.length === 0) {
        return res.status(404).json({ error: "Diagnosis sem transações ou inexistente." });
      }

      const cats = await categorizeTransactions(
        txs.map((t) => ({
          id: t.id,
          description: t.description,
          amount: Number(t.amount),
          source: t.source,
        })),
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

  return app;
}
