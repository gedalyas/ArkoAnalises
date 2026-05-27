import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePdfNubank } from "../src/parsers/parsePdfNubank";
import { parseExtratoCsv } from "../src/parsers/parseExtratoCsv";
import { categorizeTransactions, type TxToCategorize } from "../src/ai/gemini";
import { treatmentOf } from "../src/ai/categories";

const FIXTURES = join(__dirname, "fixtures");
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function run(label: string, txs: TxToCategorize[], accountOwner?: string) {
  console.log(`\n===== ${label} =====`);
  const cats = await categorizeTransactions(txs, accountOwner);
  const byId = new Map(cats.map((c) => [c.id, c]));

  const totals: Record<string, number> = { DESPESA: 0, RENDA: 0, NEUTRO: 0 };
  for (const t of txs) {
    const c = byId.get(t.id);
    const treat = c ? treatmentOf(c.category) : "NEUTRO";
    totals[treat] += t.amount;
    console.log(
      `  ${t.id.padEnd(4)} ${brl(t.amount).padStart(13)}  [${treat.padEnd(7)}] ${c?.category ?? "?"}  — ${t.description.slice(0, 45)}`,
    );
  }
  console.log("  ----");
  console.log(`  DESPESA: ${brl(totals.DESPESA)} | RENDA: ${brl(totals.RENDA)} | NEUTRO: ${brl(totals.NEUTRO)}`);
}

async function main() {
  const pdf = readFileSync(join(FIXTURES, "Nubank_2026-05-09.pdf"));
  const card = (await parsePdfNubank(pdf)).map((t) => ({
    id: t.id, description: t.description, amount: t.amount, source: t.source,
  }));
  await run("FATURA CARTÃO", card);

  const csv = readFileSync(join(FIXTURES, "extrato-conta.csv"), "utf-8");
  const bank = parseExtratoCsv(csv).map((t) => ({
    id: t.id, description: t.description, amount: t.amount, source: t.source,
  }));
  // Nome do titular via env (não commitar nome pessoal). Sem ele, auto-transferências
  // recebidas podem ser confundidas com renda — defina TEST_ACCOUNT_OWNER para testar o fix.
  await run("EXTRATO CONTA", bank, process.env.TEST_ACCOUNT_OWNER);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
