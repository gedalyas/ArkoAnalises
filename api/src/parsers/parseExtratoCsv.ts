import type { ParsedTransaction } from "./types";

/**
 * Quebra a linha do CSV de extrato em exatamente 4 campos
 * (Data, Valor, Identificador, Descrição), cortando só nas 3 primeiras
 * vírgulas — assim uma vírgula dentro da descrição não a estilhaça.
 */
function split4(line: string): [string, string, string, string] | null {
  const i1 = line.indexOf(",");
  const i2 = line.indexOf(",", i1 + 1);
  const i3 = line.indexOf(",", i2 + 1);
  if (i1 < 0 || i2 < 0 || i3 < 0) return null;
  return [line.slice(0, i1), line.slice(i1 + 1, i2), line.slice(i2 + 1, i3), line.slice(i3 + 1)];
}

/** "02/05/2026" → Date em UTC. */
function parseBrDate(raw: string): Date {
  const [d, m, y] = raw.split("/").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Parser DETERMINÍSTICO do CSV de EXTRATO do Nubank.
 * Colunas: Data,Valor,Identificador,Descrição.
 * `Valor` já vem com sinal nativo de fluxo de caixa (entrada +, saída −) e
 * separador decimal por ponto — copiado sem transformação. Não interpreta:
 * distinguir RDB/auto-transferência de despesa real é trabalho do LLM.
 */
export function parseExtratoCsv(csv: string): ParsedTransaction[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Pula o cabeçalho se a 1ª coluna não for uma data DD/MM/AAAA.
  const startIdx = /^\d{2}\/\d{2}\/\d{4}/.test(lines[0]) ? 0 : 1;

  const txs: ParsedTransaction[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const rawLine = lines[i];
    const cols = split4(rawLine);
    if (!cols) continue; // linha malformada → não inventa
    const [dateStr, valorStr, , descricao] = cols;

    txs.push({
      id: `t${txs.length + 1}`,
      rawLine,
      date: parseBrDate(dateStr),
      description: descricao.trim(),
      amount: Number(valorStr),
      source: "BANK",
      category: null,
    });
  }

  return txs;
}
