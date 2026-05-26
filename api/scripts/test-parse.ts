import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePdfNubank } from "../src/parsers/parsePdfNubank";
import { parseCsvNubank } from "../src/parsers/parseCsvNubank";
import { parseExtratoPdf } from "../src/parsers/parseExtratoPdf";
import { parseExtratoCsv } from "../src/parsers/parseExtratoCsv";
import type { ParsedTransaction } from "../src/parsers/types";

const FIXTURES = join(__dirname, "fixtures");

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function dump(title: string, txs: ParsedTransaction[]) {
  console.log(`\n===== ${title} (${txs.length} transações) =====`);
  for (const t of txs) {
    const date = t.date.toISOString().slice(0, 10);
    console.log(`  ${t.id.padEnd(4)} ${date}  ${brl(t.amount).padStart(14)}  ${t.description}`);
  }
  const positivos = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const negativos = txs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  console.log(`  ----`);
  console.log(`  Soma positivos (+): ${brl(positivos)}`);
  console.log(`  Soma negativos (−): ${brl(negativos)}`);
}

async function main() {
  const pdf = readFileSync(join(FIXTURES, "Nubank_2026-05-09.pdf"));
  dump("PDF (fatura cartão)", await parsePdfNubank(pdf));

  const csv = readFileSync(join(FIXTURES, "Nubank_2026-05-09.csv"), "utf-8");
  dump("CSV (fatura cartão)", parseCsvNubank(csv, "CREDIT_CARD"));

  const extratoPdf = readFileSync(join(FIXTURES, "extrato-conta.pdf"));
  dump("PDF (extrato conta)", await parseExtratoPdf(extratoPdf));

  const extratoCsv = readFileSync(join(FIXTURES, "extrato-conta.csv"), "utf-8");
  dump("CSV (extrato conta)", parseExtratoCsv(extratoCsv));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
