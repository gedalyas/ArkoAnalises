import { GoogleGenAI, Type } from "@google/genai";
import { ALL_CATEGORIES, type Category } from "./categories";
import { withRetry } from "./retry";
import { GEMINI_MODEL as MODEL } from "./model";

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
- Transferência (Pix/TED) em que a CONTRAPARTE é o PRÓPRIO titular da conta → "Movimentação Interna".
  ATENÇÃO: isso vale TANTO para "Transferência enviada" QUANTO para "Transferência RECEBIDA".
  Uma "Transferência recebida pelo Pix" cuja contraparte é o próprio titular NÃO é renda —
  é o titular movendo dinheiro entre contas dele mesmo. Marque como "Movimentação Interna".
- Recebimento vindo de TERCEIRO (empresa, cliente, empregador — nome DIFERENTE do titular) → "Renda".
- Demais saídas/compras → a categoria de despesa mais adequada pela descrição.

GUIA DE CATEGORIAS DE DESPESA (use a intenção do gasto, não só a forma de cobrança):
- "Educação": cursos, escolas, faculdade, plataformas de ENSINO ou IDIOMAS, mentorias.
  É Educação MESMO que seja assinatura/app. Ex: Open English, Asimov Academy, Alura, Udemy, Duolingo.
- "Assinaturas e Software": ferramentas digitais, SaaS, produtividade, hospedagem, streaming.
  Ex: LinkedIn, Canva, Render.Com, Lovable, Figma, GitHub, Vercel, Netflix, Spotify, ChatGPT/OpenAI.
- "Compras": produtos físicos / varejo / e-commerce de bens. Ex: Mizuno, lojas de roupa, eletrônicos, marketplaces.
- "Alimentação": mercado, restaurante, delivery, padaria, iFood.
- "Transporte": combustível, app de mobilidade, oficina, estacionamento, pedágio.
- "Moradia": aluguel, condomínio, luz, água, gás, internet residencial.
- "Saúde": farmácia, consultas, plano de saúde, academia.
- "Seguros": seguro/proteção patrimonial, seguro auto/vida.
- "Lazer": viagens, eventos, bares, hobbies.
- "Outros Gastos": só quando realmente não encaixar em nenhuma acima.

REGRA DO IOF: uma linha "IOF de \"X\"" é a taxa de uma compra internacional X — ela deve ter a
MESMA categoria da compra X (ex: IOF de "Render.Com" → "Assinaturas e Software"). Procure a compra
correspondente na lista e use a categoria dela.

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
  accountOwner?: string,
): Promise<Categorization[]> {
  if (txs.length === 0) return [];

  const ownerHint = accountOwner?.trim()
    ? `TITULAR DA CONTA: "${accountOwner.trim()}". Qualquer transferência (enviada OU recebida) cuja contraparte seja esse nome (ainda que parcial/abreviado) é "Movimentação Interna", NUNCA "Renda".\n\n`
    : "";

  const ai = getClient();
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: `${ownerHint}Transações:\n${JSON.stringify(txs, null, 2)}` }],
        },
      ],
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

  const items = (JSON.parse(text) as { items: Categorization[] }).items ?? [];

  // Pós-processamento DETERMINÍSTICO: "IOF de \"X\"" é a taxa da compra X e deve
  // herdar a categoria dela. Mais confiável do que depender do LLM casar as linhas.
  const itemById = new Map(items.map((c) => [c.id, c]));
  for (const t of txs) {
    const m = t.description.match(/IOF\s+de\s+"(.+?)"/i);
    if (!m) continue;
    const alvo = m[1].toLowerCase();
    const compra = txs.find(
      (x) =>
        x.id !== t.id &&
        x.source === t.source &&
        !/IOF/i.test(x.description) &&
        x.description.toLowerCase().includes(alvo),
    );
    const compraCat = compra ? itemById.get(compra.id)?.category : undefined;
    const iofItem = itemById.get(t.id);
    if (compraCat && iofItem && iofItem.category !== compraCat) {
      iofItem.category = compraCat;
      iofItem.reason = `IOF atrelado a "${m[1]}" — herda a categoria da compra.`;
    }
  }

  return items;
}
