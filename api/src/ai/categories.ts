/**
 * Taxonomia de categorias usada pelo LLM. Fixa e fechada (enum no responseSchema)
 * para o modelo não inventar categorias novas.
 *
 * Cada categoria mapeia para um "tratamento" no fluxo de caixa, do qual os totais
 * são derivados EM CÓDIGO (Regra de Ouro) — o sinal/origem sozinho não basta:
 *  - DESPESA  → gasto real (entra no total de consumo)
 *  - RENDA    → entrada real de dinheiro (salário, recebimento de terceiro)
 *  - NEUTRO   → não é gasto nem renda (movimentação interna, investimento, fatura)
 */
export type Treatment = "DESPESA" | "RENDA" | "NEUTRO";

export const DESPESA_CATEGORIES = [
  "Moradia",
  "Alimentação",
  "Transporte",
  "Saúde",
  "Educação",
  "Assinaturas e Software",
  "Lazer",
  "Compras",
  "Seguros",
  "Outros Gastos",
] as const;

export const RENDA_CATEGORIES = ["Renda"] as const;

export const NEUTRO_CATEGORIES = [
  "Movimentação Interna",
  "Investimento (Aplicação/Resgate)",
  "Pagamento de Fatura",
] as const;

export const ALL_CATEGORIES = [
  ...DESPESA_CATEGORIES,
  ...RENDA_CATEGORIES,
  ...NEUTRO_CATEGORIES,
] as const;

export type Category = (typeof ALL_CATEGORIES)[number];

const TREATMENT = new Map<string, Treatment>([
  ...DESPESA_CATEGORIES.map((c) => [c, "DESPESA" as Treatment] as const),
  ...RENDA_CATEGORIES.map((c) => [c, "RENDA" as Treatment] as const),
  ...NEUTRO_CATEGORIES.map((c) => [c, "NEUTRO" as Treatment] as const),
]);

/** Deriva o tratamento de fluxo de caixa a partir da categoria. */
export function treatmentOf(category: string): Treatment {
  return TREATMENT.get(category) ?? "NEUTRO";
}
