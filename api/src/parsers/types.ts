/**
 * Uma transação extraída DETERMINISTICAMENTE de um PDF/CSV (Regra de Ouro).
 * O parser nunca categoriza nem estima — só extrai o que está no arquivo.
 *
 * `id` é gerado aqui apenas para rastreabilidade dentro de um lote em memória
 * (o id definitivo vem do Prisma/cuid quando a transação é persistida).
 */
export type ParsedTransaction = {
  /** índice sequencial dentro do lote (ex: "t1", "t2") — citável durante testes */
  id: string;
  /** linha original intacta — nunca modificada; base para auditoria/citação */
  rawLine: string;
  /** data parseada deterministicamente */
  date: Date;
  /** descrição como veio no arquivo (sem o token de cartão "•••• 1070") */
  description: string;
  /** despesa positiva, pagamento/estorno negativo (decisão de arquitetura) */
  amount: number;
  /** origem do dado */
  source: "CREDIT_CARD" | "BANK";
  /** sempre null — só o LLM categoriza, jamais o parser */
  category: null;
};
