import { useState } from "react";
import { TrendingDown, TrendingUp, Wallet, PiggyBank, AlertTriangle, ListChecks, CalendarClock, PieChart, Compass, Scale, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { DiagnosisResult, Transaction } from "@/lib/api";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Stat({ icon, label, value, tone }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "pos" | "neg" | "neutral";
}) {
  const color = tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-red-600" : "text-gray-900";
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <div className="flex items-center gap-2 text-gray-400 mb-1">{icon}<span className="text-xs font-medium">{label}</span></div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

/**
 * Mostra AS LINHAS reais das transações que sustentam uma afirmação (Regra de Ouro:
 * nada de número solto — a pessoa vê a descrição e o valor que embasam o que a IA disse).
 * Recolhido por padrão pra não poluir; um clique revela as linhas.
 */
function CitedLines({ ids, byId }: { ids: string[]; byId: Map<string, Transaction> }) {
  const [open, setOpen] = useState(false);
  const items = (ids ?? []).map((id) => byId.get(id)).filter(Boolean) as Transaction[];
  if (items.length === 0) return null;
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-gray-600"
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
        {items.length} {items.length === 1 ? "transação que sustenta" : "transações que sustentam"} isto
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1 border-l-2 border-gray-100 pl-3">
          {items.map((t) => (
            <li key={t.id} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-gray-500" title={t.description}>{t.description}</span>
              <span className="shrink-0 tabular-nums font-medium text-gray-600">{brl(Number(t.amount))}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DiagnosisReport({ result, transactions }: { result: DiagnosisResult; transactions: Transaction[] }) {
  const { totais, categorizacao, vazamentos, balanco, plano30dias, plano60dias } = result;
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const categorias = Object.entries(totais.despesaPorCategoria).sort((a, b) => b[1] - a[1]);
  const maxCat = categorias[0]?.[1] ?? 1;

  return (
    <div className="space-y-6">
      {/* Totais — calculados em código */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<TrendingUp className="h-4 w-4" />}
          label={totais.rendaInformada ? "Renda informada" : "Renda identificada"} tone="pos"
          value={totais.rendaConsiderada > 0 ? brl(totais.rendaConsiderada) : "—"} />
        <Stat icon={<TrendingDown className="h-4 w-4" />} label="Despesa total" tone="neg" value={brl(totais.despesaTotal)} />
        <Stat icon={<Wallet className="h-4 w-4" />} label="Saldo livre"
          tone={totais.saldoLivre >= 0 ? "pos" : "neg"} value={brl(totais.saldoLivre)} />
        <Stat icon={<PiggyBank className="h-4 w-4" />} label="Taxa de poupança"
          value={totais.taxaPoupanca !== null ? `${totais.taxaPoupanca.toFixed(1)}%` : "—"} />
      </div>
      {totais.rendaInformada ? (
        <p className="-mt-3 text-xs text-gray-400">
          * Renda informada por você no questionário — não consta nos extratos/faturas enviados.
        </p>
      ) : null}

      {/* Despesa por categoria */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PieChart className="h-4 w-4 text-brand-600" /> Gastos por categoria
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {categorias.length === 0 && <p className="text-sm text-gray-500">Nenhuma despesa categorizada.</p>}
          {categorias.map(([cat, val]) => (
            <div key={cat}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700">{cat}</span>
                <span className="font-medium text-gray-900">{brl(val)}</span>
              </div>
              <Progress value={(val / maxCat) * 100} className="h-2" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 1. Para onde vai o dinheiro */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Compass className="h-4 w-4 text-brand-600" /> Para onde vai o seu dinheiro
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">{categorizacao.resumo}</p>
          <div className="space-y-3">
            {categorizacao.destaques.map((d, i) => (
              <div key={i} className="rounded-lg bg-gray-50 p-3">
                <Badge variant="secondary">{d.categoria}</Badge>
                <p className="text-sm text-gray-700 mt-2">{d.observacao}</p>
                <CitedLines ids={d.transacaoIds} byId={byId} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 2. Vazamentos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Vazamentos e oportunidades
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">{vazamentos.resumo}</p>
          <div className="space-y-3">
            {vazamentos.itens.map((it, i) => (
              <div key={i} className="rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                <p className="text-sm font-medium text-gray-800">{it.descricao}</p>
                <CitedLines ids={it.transacaoIds} byId={byId} />
                <p className="text-sm text-gray-600 mt-2">💡 {it.sugestao}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 3. Balanço */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="h-4 w-4 text-brand-600" /> Balanço geral
          </CardTitle>
        </CardHeader>
        <CardContent><p className="text-sm text-gray-600 leading-relaxed">{balanco.observacao}</p></CardContent>
      </Card>

      {/* 4 + 5. Planos de ação */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-brand-600" /> Plano de ação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 mb-2">Próximos 30 dias</p>
            <ul className="space-y-2">
              {plano30dias.acoes.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-0.5 text-brand-500">→</span>
                  <div className="flex-1 min-w-0">
                    <span>{a.acao}</span>
                    <CitedLines ids={a.transacaoIds} byId={byId} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <Separator />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" /> Próximos 60 dias
            </p>
            <ul className="space-y-2">
              {plano60dias.acoes.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-0.5 text-gray-400">→</span>
                  <span>{a.acao}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
