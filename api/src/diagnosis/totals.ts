import { treatmentOf } from "../ai/categories";

/** Transação como vem do banco (amount é Decimal do Prisma → coagido a number). */
export type TxForTotals = {
  amount: unknown; // Prisma.Decimal | number | string
  category: string | null;
};

export type Totals = {
  /** gasto real do período (Σ |amount| de tudo classificado como DESPESA) */
  despesaTotal: number;
  /** renda real do período (Σ |amount| de tudo classificado como RENDA) */
  rendaTotal: number;
  /** movimentações neutras (Σ |amount| — interna/investimento/fatura) */
  neutroTotal: number;
  /** gasto por categoria, só categorias de despesa, em valor absoluto */
  despesaPorCategoria: Record<string, number>;
  /** transações ainda sem categoria (LLM não rodou ou não cobriu) */
  semCategoria: number;
};

/** arredonda para 2 casas evitando lixo de ponto flutuante na soma */
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Calcula os totais do diagnóstico EM CÓDIGO — o LLM nunca soma nada.
 * Usa |amount| por tratamento porque o sinal é nativo por fonte (despesa do
 * cartão é +, despesa da conta é −); o que importa é a magnitude do gasto/renda.
 */
export function computeTotals(txs: TxForTotals[]): Totals {
  let despesaTotal = 0;
  let rendaTotal = 0;
  let neutroTotal = 0;
  let semCategoria = 0;
  const despesaPorCategoria: Record<string, number> = {};

  for (const t of txs) {
    if (!t.category) {
      semCategoria++;
      continue;
    }
    const abs = Math.abs(Number(t.amount));
    switch (treatmentOf(t.category)) {
      case "DESPESA":
        despesaTotal += abs;
        despesaPorCategoria[t.category] = (despesaPorCategoria[t.category] ?? 0) + abs;
        break;
      case "RENDA":
        rendaTotal += abs;
        break;
      case "NEUTRO":
        neutroTotal += abs;
        break;
    }
  }

  for (const k of Object.keys(despesaPorCategoria)) {
    despesaPorCategoria[k] = round2(despesaPorCategoria[k]);
  }
  return {
    despesaTotal: round2(despesaTotal),
    rendaTotal: round2(rendaTotal),
    neutroTotal: round2(neutroTotal),
    despesaPorCategoria,
    semCategoria,
  };
}
