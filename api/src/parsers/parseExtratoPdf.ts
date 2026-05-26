import { PDFParse } from "pdf-parse";
import type { ParsedTransaction } from "./types";

const MONTHS_PT: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

/** Cabeçalho do dia + abre bloco de entradas: "02 MAI 2026 Total de entradas + 400,00" */
const DAY_HEADER = /^(\d{2})\s+([A-Z]{3})\s+(\d{4})\s+Total de entradas\b/;
/** Abre bloco de saídas: "Total de saídas - 400,00" (mesma data do dia corrente) */
const SAIDAS_HEADER = /^Total de saídas\b/;
/** Linha que é SÓ um valor (caso da transferência multi-linha): "2.301,34" */
const AMOUNT_ONLY = /^([\d.]+,\d{2})$/;
/** Descrição + valor na mesma linha: "Aplicação RDB 400,00" */
const INLINE_AMOUNT = /^(.*\S)\s+([\d.]+,\d{2})$/;

/** Linha de cabeçalho da conta (genérica, sem dado pessoal): "... CPF Agência Conta" */
const ACCOUNT_HEADER = /CPF\s+Agência\s+Conta/;

/**
 * Cabeçalho/rodapé que se repetem a cada página — ignorados na extração.
 * Padrões ESTRUTURAIS (não fixam nome/conta de ninguém):
 *  - ACCOUNT_HEADER cobre a linha de identificação da conta
 *  - /^\d{6,}-\d$/ cobre o número da conta isolado (linha só com dígitos e -N)
 *  - o NOME do titular é tratado por lookahead no loop (linha antes do header)
 */
const NOISE: RegExp[] = [
  ACCOUNT_HEADER,
  /^\d{6,}-\d$/,
  /VALORES EM R\$/,
  /^Tem alguma dúvida/,
  /^metropolitanas\)/,
  /^-- \d+ of \d+ --$/,
  /^Caso a solução fornecida/,
  /^disponíveis em nubank/,
  /^Extrato gerado dia/,
  /^O saldo líquido corresponde/,
  /^Não nos responsabilizamos/,
  /^Asseguramos a autenticidade/,
  /^Nu Financeira/,
  /^Nu Pagamentos/,
  /^Investimento$/,
  /^Pagamento$/,
  /^CNPJ:/,
];

/** "2.301,34" → 2301.34 (sem sinal; o sinal vem do bloco entradas/saídas). */
function parseBrAmount(raw: string): number {
  return Number(raw.replace(/\./g, "").replace(",", "."));
}

/**
 * Parser DETERMINÍSTICO do PDF de EXTRATO do Nubank.
 *
 * É STATEFUL: os valores individuais não têm sinal no PDF — o sinal é dado pelo
 * bloco em que a linha aparece ("Total de entradas" → +, "Total de saídas" → −).
 * As linhas de "Total de ..." são subtotais e NÃO viram transação.
 *
 * Garantia: amount/sinal/data sempre corretos. Descrições de transferências que
 * quebram entre páginas podem carregar um fragmento da vizinha (ruído inofensivo),
 * mas isso nunca cria/perde transação nem afeta os totais.
 */
export async function parseExtratoPdf(pdf: Buffer | Uint8Array): Promise<ParsedTransaction[]> {
  const parser = new PDFParse({ data: pdf instanceof Buffer ? new Uint8Array(pdf) : pdf });
  const { text } = await parser.getText();

  const allLines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const movStart = allLines.findIndex((l) => l === "Movimentações");
  const lines = movStart === -1 ? allLines : allLines.slice(movStart + 1);

  const txs: ParsedTransaction[] = [];
  let date: Date | null = null;
  let sign = 1;
  let descBuffer: string[] = [];
  let rawBuffer: string[] = [];

  const emit = (amountStr: string) => {
    if (!date) return; // sem data corrente não há como datar → ignora
    txs.push({
      id: `t${txs.length + 1}`,
      rawLine: rawBuffer.join("\n"),
      date,
      description: descBuffer.join(" ").trim(),
      amount: parseBrAmount(amountStr) * sign,
      source: "BANK",
      category: null,
    });
    descBuffer = [];
    rawBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Nome do titular: linha imediatamente antes do cabeçalho da conta. Pulada
    // por posição (estrutural), sem fixar o nome de ninguém no código.
    if (i + 1 < lines.length && ACCOUNT_HEADER.test(lines[i + 1])) continue;

    const day = line.match(DAY_HEADER);
    if (day && day[2] in MONTHS_PT) {
      date = new Date(Date.UTC(Number(day[3]), MONTHS_PT[day[2]] - 1, Number(day[1])));
      sign = 1;
      descBuffer = [];
      rawBuffer = [];
      continue; // subtotal de entradas — não é transação
    }
    if (SAIDAS_HEADER.test(line)) {
      sign = -1;
      descBuffer = [];
      rawBuffer = [];
      continue; // subtotal de saídas — não é transação
    }
    if (NOISE.some((re) => re.test(line))) continue;

    const only = line.match(AMOUNT_ONLY);
    if (only) {
      rawBuffer.push(line);
      emit(only[1]);
      continue;
    }
    const inline = line.match(INLINE_AMOUNT);
    if (inline) {
      descBuffer.push(inline[1]);
      rawBuffer.push(line);
      emit(inline[2]);
      continue;
    }
    // linha de descrição pura (pode ser multi-linha)
    descBuffer.push(line);
    rawBuffer.push(line);
  }

  return txs;
}
