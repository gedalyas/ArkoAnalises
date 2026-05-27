import { GoogleGenAI, Type } from "@google/genai";
import type { Totals } from "../diagnosis/totals";

const MODEL = "gemini-2.5-flash";

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada no ambiente.");
  return new GoogleGenAI({ apiKey });
}

/** Transação enxuta enviada ao LLM para geração do diagnóstico. */
export type TxForDiagnosis = {
  id: string;
  date: string;        // ISO string — só para o LLM identificar recorrência
  description: string;
  amount: number;
  source: "CREDIT_CARD" | "BANK";
  category: string;
};

export type DiagnosisResult = {
  /** Totais calculados em código — não vêm do LLM */
  totais: Totals & {
    saldoLivre: number;
    taxaPoupanca: number | null;
  };
  /** Seções geradas pelo LLM */
  categorizacao: {
    resumo: string;
    destaques: Array<{
      categoria: string;
      observacao: string;
      transacaoIds: string[];
    }>;
  };
  vazamentos: {
    resumo: string;
    itens: Array<{
      descricao: string;
      transacaoIds: string[];
      sugestao: string;
    }>;
  };
  balanco: {
    observacao: string;
  };
  plano30dias: {
    acoes: Array<{
      acao: string;
      transacaoIds: string[];
    }>;
  };
  plano60dias: {
    acoes: Array<{
      acao: string;
    }>;
  };
};

const SYSTEM_INSTRUCTION = `
Você é um consultor financeiro da Arko Consultoria gerando um diagnóstico para um lead.

REGRAS ABSOLUTAS — nunca violar:
1. NUNCA invente, altere ou estime valores numéricos. Os totais já foram calculados pelo sistema e serão fornecidos.
2. Para toda afirmação, cite os "id"s das transações que a sustentam no campo "transacaoIds".
3. Se a renda for zero, não estime renda — diga que não foi identificada nos dados.
4. Seja direto e concreto. Evite generalidades do tipo "tente economizar mais".
5. Nos planos de ação, sugira ações específicas baseadas nas transações reais — mencione nomes de estabelecimentos/serviços quando relevante.

CONTEXTO:
- Source CREDIT_CARD: fatura do cartão. Amount positivo = despesa, negativo = pagamento/estorno.
- Source BANK: extrato bancário. Amount positivo = entrada, negativo = saída.
- Categoria "Pagamento de Fatura" = quitação do cartão — NÃO é despesa nova.
- Categoria "Movimentação Interna" = auto-transferência — NÃO é renda nem despesa.
- Categoria "Investimento (Aplicação/Resgate)" = movimentação financeira — NÃO é despesa.
`.trim();

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    categorizacao: {
      type: Type.OBJECT,
      properties: {
        resumo: { type: Type.STRING },
        destaques: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              categoria: { type: Type.STRING },
              observacao: { type: Type.STRING },
              transacaoIds: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["categoria", "observacao", "transacaoIds"],
            propertyOrdering: ["categoria", "observacao", "transacaoIds"],
          },
        },
      },
      required: ["resumo", "destaques"],
      propertyOrdering: ["resumo", "destaques"],
    },
    vazamentos: {
      type: Type.OBJECT,
      properties: {
        resumo: { type: Type.STRING },
        itens: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              descricao: { type: Type.STRING },
              transacaoIds: { type: Type.ARRAY, items: { type: Type.STRING } },
              sugestao: { type: Type.STRING },
            },
            required: ["descricao", "transacaoIds", "sugestao"],
            propertyOrdering: ["descricao", "transacaoIds", "sugestao"],
          },
        },
      },
      required: ["resumo", "itens"],
      propertyOrdering: ["resumo", "itens"],
    },
    balanco: {
      type: Type.OBJECT,
      properties: {
        observacao: { type: Type.STRING },
      },
      required: ["observacao"],
    },
    plano30dias: {
      type: Type.OBJECT,
      properties: {
        acoes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              acao: { type: Type.STRING },
              transacaoIds: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["acao", "transacaoIds"],
            propertyOrdering: ["acao", "transacaoIds"],
          },
        },
      },
      required: ["acoes"],
    },
    plano60dias: {
      type: Type.OBJECT,
      properties: {
        acoes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              acao: { type: Type.STRING },
            },
            required: ["acao"],
          },
        },
      },
      required: ["acoes"],
    },
  },
  required: ["categorizacao", "vazamentos", "balanco", "plano30dias", "plano60dias"],
  propertyOrdering: ["categorizacao", "vazamentos", "balanco", "plano30dias", "plano60dias"],
};

/**
 * Gera o diagnóstico completo (5 seções) via Gemini.
 * Os totais são calculados em código e enviados prontos ao LLM —
 * o LLM só gera narrativa e cita ids (Regra de Ouro).
 */
export async function generateDiagnosis(
  txs: TxForDiagnosis[],
  totals: Totals,
  questionnaire?: unknown,
): Promise<DiagnosisResult> {
  const saldoLivre = totals.rendaTotal - totals.despesaTotal;
  const taxaPoupanca =
    totals.rendaTotal > 0
      ? Math.round((saldoLivre / totals.rendaTotal) * 10000) / 100
      : null;

  const prompt = `
TOTAIS DO PERÍODO (calculados pelo sistema — use estes números, não recalcule):
- Renda total: R$ ${totals.rendaTotal.toFixed(2)}
- Despesa total: R$ ${totals.despesaTotal.toFixed(2)}
- Saldo livre: R$ ${saldoLivre.toFixed(2)}
- Taxa de poupança implícita: ${taxaPoupanca !== null ? taxaPoupanca.toFixed(1) + "%" : "indisponível (sem renda identificada nos dados)"}
- Despesa por categoria: ${JSON.stringify(totals.despesaPorCategoria, null, 2)}
${questionnaire ? `\nRESPOSTAS DO QUESTIONÁRIO:\n${JSON.stringify(questionnaire, null, 2)}` : "\n(Questionário não respondido — baseie-se apenas nos dados das transações)"}

TRANSAÇÕES CATEGORIZADAS:
${JSON.stringify(txs, null, 2)}
`.trim();

  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini retornou resposta vazia.");

  const llmOutput = JSON.parse(text) as Omit<DiagnosisResult, "totais">;

  return {
    totais: { ...totals, saldoLivre, taxaPoupanca },
    ...llmOutput,
  };
}
