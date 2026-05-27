import { GoogleGenAI, Type } from "@google/genai";
import type { Totals } from "../diagnosis/totals";
import { withRetry } from "./retry";
import { GEMINI_MODEL as MODEL } from "./model";

export const MAX_TURNS = 5;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada no ambiente.");
  return new GoogleGenAI({ apiKey });
}

export type QuestionnaireMessage = {
  role: "ai" | "user";
  text: string | null; // null no turno final (done)
  done?: boolean;
};

/** Resumo condensado das transações — evita mandar a lista completa no prompt. */
export type TxSummary = {
  totais: Totals;
  /** Descrições únicas das transações de renda encontradas (pode ser vazio). */
  rendaDescricoes: string[];
  /** Categorias de despesa presentes com seus totais. */
  despesaPorCategoria: Record<string, number>;
};

const SYSTEM_INSTRUCTION = `
Você coleta informações para complementar um diagnóstico financeiro da Arko Consultoria.

OBJETIVO: identificar lacunas nos dados financeiros do lead e fazer PERGUNTAS CURTAS E DIRETAS
para preenchê-las. Máximo ${MAX_TURNS} perguntas no total.

LACUNAS PRIORITÁRIAS (na ordem):
1. Renda mensal líquida — se não houver nenhuma transação categorizada como "Renda"
2. Dívidas ou financiamentos fora do cartão (ex: financiamento de carro, empréstimo pessoal)
3. Dependentes financeiros (filhos, cônjuge sem renda própria)
4. Objetivos de curto prazo (próximos 6 meses)

REGRAS:
- Uma pergunta por vez. Seja direto — máximo 2 frases.
- Se as lacunas prioritárias já foram respondidas OU já fez ${MAX_TURNS} perguntas → retorne done: true.
- Se os dados já cobrem uma lacuna (ex: há renda identificada) → pule essa pergunta.
- Nunca invente ou confirme valores — apenas pergunte.
- Retorne done: true quando tiver informação suficiente para um diagnóstico útil.
`.trim();

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    question: { type: Type.STRING },
    done: { type: Type.BOOLEAN },
  },
  required: ["question", "done"],
  propertyOrdering: ["done", "question"],
};

/**
 * Decide a próxima pergunta do questionário com base no resumo das transações
 * e no histórico da conversa até o momento.
 * Retorna { question, done } — done = true encerra o questionário.
 */
export async function getNextQuestion(
  summary: TxSummary,
  history: QuestionnaireMessage[],
): Promise<{ question: string; done: boolean }> {
  const aiTurns = history.filter((m) => m.role === "ai").length;
  if (aiTurns >= MAX_TURNS) {
    return { question: "", done: true };
  }

  const prompt = `
RESUMO DOS DADOS FINANCEIROS DO LEAD:
- Renda identificada nas transações: ${summary.totais.rendaTotal > 0 ? `R$ ${summary.totais.rendaTotal.toFixed(2)}` : "nenhuma"}
- Despesa total: R$ ${summary.totais.despesaTotal.toFixed(2)}
- Categorias de despesa: ${JSON.stringify(summary.despesaPorCategoria)}
${summary.rendaDescricoes.length > 0 ? `- Fontes de renda encontradas: ${summary.rendaDescricoes.join(", ")}` : ""}

HISTÓRICO DA CONVERSA ATÉ AGORA (${aiTurns}/${MAX_TURNS} perguntas feitas):
${history.length === 0 ? "(nenhuma pergunta feita ainda)" : history.map((m) => `${m.role === "ai" ? "IA" : "Lead"}: ${m.text}`).join("\n")}
`.trim();

  const ai = getClient();
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0,
      },
    }),
  );

  const text = response.text;
  if (!text) throw new Error("Gemini retornou resposta vazia.");

  const parsed = JSON.parse(text) as { question: string; done: boolean };
  return parsed;
}
