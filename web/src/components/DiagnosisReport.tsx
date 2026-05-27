import { TrendingDown, TrendingUp, Wallet, PiggyBank, AlertTriangle, ListChecks, CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { DiagnosisResult } from "@/lib/api";

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

/** Cita as transações que sustentam uma afirmação (Regra de Ouro). */
function Cites({ ids }: { ids: string[] }) {
  if (!ids?.length) return null;
  return (
    <span className="ml-2 inline-flex items-center text-[11px] text-gray-400">
      {ids.length} {ids.length === 1 ? "transação" : "transações"}
    </span>
  );
}

export function DiagnosisReport({ result }: { result: DiagnosisResult }) {
  const { totais, categorizacao, vazamentos, balanco, plano30dias, plano60dias } = result;
  const categorias = Object.entries(totais.despesaPorCategoria).sort((a, b) => b[1] - a[1]);
  const maxCat = categorias[0]?.[1] ?? 1;

  return (
    <div className="space-y-6">
      {/* Totais — calculados em código */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<TrendingUp className="h-4 w-4" />} label="Renda identificada" tone="pos"
          value={totais.rendaTotal > 0 ? brl(totais.rendaTotal) : "—"} />
        <Stat icon={<TrendingDown className="h-4 w-4" />} label="Despesa total" tone="neg" value={brl(totais.despesaTotal)} />
        <Stat icon={<Wallet className="h-4 w-4" />} label="Saldo livre"
          tone={totais.saldoLivre >= 0 ? "pos" : "neg"} value={brl(totais.saldoLivre)} />
        <Stat icon={<PiggyBank className="h-4 w-4" />} label="Taxa de poupança"
          value={totais.taxaPoupanca !== null ? `${totais.taxaPoupanca.toFixed(1)}%` : "—"} />
      </div>

      {/* Despesa por categoria */}
      <Card>
        <CardHeader><CardTitle className="text-base">Gastos por categoria</CardTitle></CardHeader>
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
        <CardHeader><CardTitle className="text-base">Para onde vai o seu dinheiro</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">{categorizacao.resumo}</p>
          <div className="space-y-3">
            {categorizacao.destaques.map((d, i) => (
              <div key={i} className="rounded-lg bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">{d.categoria}</Badge>
                  <Cites ids={d.transacaoIds} />
                </div>
                <p className="text-sm text-gray-700 mt-2">{d.observacao}</p>
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
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800">{it.descricao}</p>
                  <Cites ids={it.transacaoIds} />
                </div>
                <p className="text-sm text-gray-600 mt-1.5">💡 {it.sugestao}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 3. Balanço */}
      <Card>
        <CardHeader><CardTitle className="text-base">Balanço geral</CardTitle></CardHeader>
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
                  <span>{a.acao}<Cites ids={a.transacaoIds} /></span>
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
