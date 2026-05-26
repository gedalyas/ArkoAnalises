import type { ParsedTransaction } from "./types";

/**
 * Quebra UMA linha de CSV em campos, respeitando aspas e o escape "" (aspa dupla).
 * Ex: `2026-04-11,"IOF de ""Lovable""",4.57` → ["2026-04-11", `IOF de "Lovable"`, "4.57"]
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } // "" → " literal
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else cur += ch;
  }
  fields.push(cur);
  return fields;
}

/** "2026-04-23" → Date em UTC (sem deslocamento de fuso). */
function parseIsoDate(raw: string): Date {
  const [y, m, d] = raw.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Parser DETERMINÍSTICO do CSV do Nubank (colunas: date,title,amount).
 * O CSV já vem com o sinal na nossa convenção (despesa +, pagamento −), então
 * o valor é copiado sem transformação. Não categoriza nem estima.
 *
 * `source` é parâmetro porque o CSV pode ser extrato bancário (BANK) ou
 * a fatura do cartão exportada (CREDIT_CARD) — quem chama decide.
 */
export function parseCsvNubank(
  csv: string,
  source: ParsedTransaction["source"] = "BANK",
): ParsedTransaction[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Pula o cabeçalho se a primeira coluna não for uma data ISO.
  const startIdx = /^\d{4}-\d{2}-\d{2}/.test(lines[0]) ? 0 : 1;

  const txs: ParsedTransaction[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const rawLine = lines[i];
    const [dateStr, title, amountStr] = splitCsvLine(rawLine);
    if (!dateStr || amountStr === undefined) continue; // linha malformada → não inventa

    txs.push({
      id: `t${txs.length + 1}`,
      rawLine,
      date: parseIsoDate(dateStr),
      description: title.trim(),
      amount: Number(amountStr),
      source,
      category: null,
    });
  }

  return txs;
}
