import { GoogleGenAI, Type } from "@google/genai";
import { ALL_CATEGORIES, type Category } from "./categories";

const MODEL = "gemini-2.5-flash";

let client: GoogleGenAI | null = null;

/** Cliente Gemini (singleton), lendo a key SOMENTE de variável de ambiente. */
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não configurada no ambiente (api/.env).");
  }
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/** Transação enxuta enviada ao LLM — só o necessário para categorizar. */
export type TxToCategorize = {
  id: string;
  description: string;
  amount: number;
  source: "CREDIT_CARD" | "BANK";
};

export type Categorization = {
  id: string;
  category: Category;
  /** justificativa curta — base da rastreabilidade exigida pela Regra de Ouro */
  reason: string;
};

const SYSTEM_INSTRUCTION = `
Você categoriza transações financeiras de um diagnóstico (Arko Consultoria).

REGRAS ABSOLUTAS:
- Você SÓ classifica. NUNCA invente, altere ou estime valores.
- Para CADA transação recebida, devolva exatamente um item com o MESMO "id".
- Use apenas as categorias permitidas (enum). Nada fora da lista.

COMO DECIDIR a categoria:
- "Aplicação RDB" / "Resgate RDB" → "Investimento (Aplicação/Resgate)".
- "Pagamento de fatura" (do cartão) → "Pagamento de Fatura".
- Transferência (Pix/TED) em que a CONTRAPARTE é o PRÓPRIO titular da conta
  (mesmo nome de pessoa se repetindo como remetente/destinatário) → "Movimentação Interna".
- Recebimento vindo de TERCEIRO (empresa, cliente, empregador) → "Renda".
- Demais saídas/compras → a categoria de despesa mais adequada pela descrição
  (ex: Linkedin/Canva/Render/software → "Assinaturas e Software"; seguro/proteção → "Seguros").
- Na dúvida entre despesas, use "Outros Gastos".

O campo "reason" deve ser uma frase curta justificando, citando o que na descrição levou à categoria.
`.trim();

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          category: { type: Type.STRING, enum: [...ALL_CATEGORIES] },
          reason: { type: Type.STRING },
        },
        required: ["id", "category", "reason"],
        propertyOrdering: ["id", "category", "reason"],
      },
    },
  },
  required: ["items"],
};

/**
 * Categoriza um lote de transações com o Gemini (responseSchema = JSON estruturado).
 * Devolve um item por transação. O código (não o LLM) calcula totais a partir disso.
 */
export async function categorizeTransactions(
  txs: TxToCategorize[],
): Promise<Categorization[]> {
  if (txs.length === 0) return [];

  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: `Transações:\n${JSON.stringify(txs, null, 2)}` }],
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini retornou resposta vazia.");

  const parsed = JSON.parse(text) as { items: Categorization[] };
  return parsed.items ?? [];
}
