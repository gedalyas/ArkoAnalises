import { PDFParse } from "pdf-parse";
import type { ParsedTransaction } from "./types";

/** Mês em português (3 letras, como o Nubank emite) → número 1-12. */
const MONTHS_PT: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

/** Início de uma transação: "02 ABR <resto>" */
const TX_START = /^(\d{2})\s+([A-Z]{3})\s+(.*)$/;
/** Valor BR no fim da linha, com sinal opcional ("-"/"−"): "R$ 1.126,49" */
const TRAILING_AMOUNT = /\s*(-|−)?\s*R\$\s*([\d.]+,\d{2})\s*$/;
/** Linha que é SOMENTE um valor (caso da compra internacional) */
const AMOUNT_ONLY = /^\s*(-|−)?\s*R\$\s*([\d.]+,\d{2})\s*$/;
/** Token de cartão a remover da descrição: "•••• 1070" */
const CARD_TOKEN = /•{2,}\s*\d{4}\s*/;

/** "1.126,49" → 1126.49 (determinístico, sem erro de ponto flutuante de origem). */
function parseBrAmount(raw: string, minus: string | undefined): number {
  const n = Number(raw.replace(/\./g, "").replace(",", "."));
  return minus ? -n : n;
}

/**
 * Descobre o ano e o mês de fechamento a partir do cabeçalho "FATURA 11 MAI 2026".
 * Necessário porque as linhas de transação só trazem "DD MMM" sem ano.
 */
function readStatementRef(text: string): { year: number; closingMonth: number } {
  const m = text.match(/FATURA\s+\d{2}\s+([A-Z]{3})\s+(\d{4})/);
  if (!m) {
    throw new Error("Não foi possível ler a referência da fatura (FATURA DD MMM AAAA) no PDF.");
  }
  return { year: Number(m[2]), closingMonth: MONTHS_PT[m[1]] };
}

/** Constrói a data inferindo o ano: mês posterior ao fechamento pertence ao ano anterior. */
function buildDate(day: number, month: number, ref: { year: number; closingMonth: number }): Date {
  const year = month > ref.closingMonth ? ref.year - 1 : ref.year;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Recorta apenas o bloco de transações do texto completo da fatura. */
function sliceTransactionBlock(lines: string[]): string[] {
  const start = lines.findIndex((l) => /^TRANSAÇÕES DE/.test(l));
  if (start === -1) return [];
  const endRel = lines.slice(start + 1).findIndex((l) => /^Em cumprimento à regulação/.test(l));
  const end = endRel === -1 ? lines.length : start + 1 + endRel;
  return lines.slice(start + 1, end);
}

/**
 * Parser DETERMINÍSTICO da fatura de cartão do Nubank (PDF).
 * Extrai cada transação como {id, rawLine, date, description, amount, source, category:null}.
 * Linhas de subtotal (não começam com data) são ignoradas para não duplicar valores.
 */
export async function parsePdfNubank(
  pdf: Buffer | Uint8Array,
  source: ParsedTransaction["source"] = "CREDIT_CARD",
): Promise<ParsedTransaction[]> {
  const parser = new PDFParse({ data: pdf instanceof Buffer ? new Uint8Array(pdf) : pdf });
  const { text } = await parser.getText();

  const ref = readStatementRef(text);
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const block = sliceTransactionBlock(lines);

  const txs: ParsedTransaction[] = [];

  for (let i = 0; i < block.length; i++) {
    const line = block[i];
    const startMatch = line.match(TX_START);
    if (!startMatch) continue; // subtotais e ruído não começam com "DD MMM"

    const day = Number(startMatch[1]);
    const monthName = startMatch[2];
    if (!(monthName in MONTHS_PT)) continue; // só mês válido (ex: "ABR") vira transação
    const month = MONTHS_PT[monthName];
    const rest = startMatch[3];

    const date = buildDate(day, month, ref);
    const inline = rest.match(TRAILING_AMOUNT);

    let amount: number;
    let description: string;
    let rawLine = line;

    if (inline) {
      // Caso comum: valor na mesma linha.
      amount = parseBrAmount(inline[2], inline[1]);
      description = rest.slice(0, inline.index).replace(CARD_TOKEN, "").trim();
    } else {
      // Compra internacional: valor numa linha isolada algumas linhas abaixo.
      description = rest.replace(CARD_TOKEN, "").trim();
      let j = i + 1;
      let amountMatch: RegExpMatchArray | null = null;
      while (j < block.length) {
        rawLine += "\n" + block[j];
        amountMatch = block[j].match(AMOUNT_ONLY);
        if (amountMatch) break;
        j++;
      }
      if (!amountMatch) continue; // sem valor → não inventa, ignora
      amount = parseBrAmount(amountMatch[2], amountMatch[1]);
      i = j; // pula as linhas já consumidas (USD/Conversão/valor)
    }

    txs.push({
      id: `t${txs.length + 1}`,
      rawLine,
      date,
      description,
      amount,
      source,
      category: null,
    });
  }

  return txs;
}
