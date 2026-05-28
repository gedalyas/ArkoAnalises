import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, Send, SkipForward, AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getDiagnosis,
  sendQuestionnaireAnswer,
  generateDiagnosis,
  type DiagnosisResult,
  type Transaction,
} from "@/lib/api";
import { DiagnosisReport } from "@/components/DiagnosisReport";
import logoArko from "@/assets/logotipo-horizontal.png";

type Phase = "loading" | "questionnaire" | "generating" | "done" | "error";
type ChatMsg = { role: "ai" | "user"; text: string };

const MAX_TURNS = 5;

export function DiagnosisPage() {
  const { id } = useParams<{ id: string }>();
  const initRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("loading");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [turn, setTurn] = useState(0);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function fail(e: unknown) {
    setErrorMsg(e instanceof Error ? e.message : "Algo deu errado.");
    setPhase("error");
  }

  async function runGenerate() {
    setPhase("generating");
    try {
      const { result } = await generateDiagnosis(id!);
      setResult(result);
      setPhase("done");
    } catch (e) {
      fail(e);
    }
  }

  async function askNext(answer?: string, skip?: boolean) {
    setBusy(true);
    setInput("");
    try {
      if (answer) setMessages((prev) => [...prev, { role: "user", text: answer }]);
      const r = await sendQuestionnaireAnswer(id!, answer, skip);
      setTurn(r.turn);
      if (r.done) {
        await runGenerate();
      } else if (r.question) {
        setMessages((prev) => [...prev, { role: "ai", text: r.question! }]);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!id || initRef.current) return;
    initRef.current = true;
    (async () => {
      try {
        const s = await getDiagnosis(id);
        setTransactions(s.transactions ?? []);
        if (s.status === "DONE" && s.result) {
          setResult(s.result);
          setPhase("done");
          return;
        }
        if (s.status === "ERROR") {
          setErrorMsg(s.errorMsg ?? "Falha ao gerar o diagnóstico.");
          setPhase("error");
          return;
        }
        const history = s.questionnaire ?? [];
        const textMsgs: ChatMsg[] = history
          .filter((m) => m.text)
          .map((m) => ({ role: m.role, text: m.text as string }));
        setMessages(textMsgs);
        setTurn(history.filter((m) => m.role === "ai" && m.text).length);

        if (history.some((m) => m.done)) {
          await runGenerate();
          return;
        }
        setPhase("questionnaire");
        const last = history[history.length - 1];
        // sem pergunta pendente (histórico vazio ou aguardando a IA) → busca a próxima
        if (!last || last.role === "user") await askNext(undefined);
      } catch (e) {
        fail(e);
      }
    })();
  }, [id]);

  // ── Telas ────────────────────────────────────────────────────────────────
  if (phase === "loading") return <Centered><Spinner label="Carregando…" /></Centered>;

  if (phase === "generating")
    return (
      <Centered>
        <Spinner label="Gerando seu diagnóstico…" />
        <p className="text-sm text-gray-400 mt-2">Analisando suas transações com IA. Leva alguns segundos.</p>
      </Centered>
    );

  if (phase === "error")
    return (
      <Centered>
        <div className="text-center max-w-sm">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <p className="text-gray-800 font-medium mb-1">Não foi possível concluir</p>
          <p className="text-sm text-gray-500 mb-5">{errorMsg}</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => runGenerate()}>Tentar novamente</Button>
            <Link to="/"><Button variant="outline">Voltar ao início</Button></Link>
          </div>
        </div>
      </Centered>
    );

  if (phase === "done" && result)
    return (
      <main className="min-h-screen py-10 px-4">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8 flex flex-col items-center text-center">
            <img src={logoArko} alt="Arko Consultoria Financeira" className="h-20 sm:h-20 lg:h-28 w-auto mb-6 lg:mb-8 mx-auto lg:mx-0" />
            <h1 className="text-2xl font-bold text-gray-900">Seu Diagnóstico Express</h1>
            <p className="text-sm text-gray-500 mt-1">Análise feita sobre as transações que você enviou.</p>
          </div>
          <DiagnosisReport result={result} transactions={transactions} />
          <p className="text-center text-xs text-gray-400 mt-8">
            Diagnóstico gerado a partir das transações enviadas. Os valores são calculados sobre os
            dados reais; nenhuma estimativa foi inventada.
          </p>
        </div>
      </main>
    );

  // phase === "questionnaire"
  const awaitingAi = busy && (messages.length === 0 || messages[messages.length - 1]?.role === "user");
  const canAnswer = !busy && messages[messages.length - 1]?.role === "ai";

  return (
    <main className="min-h-screen flex items-start justify-center p-4 pt-12">
      <div className="w-full max-w-xl">
        <div className="flex flex-col items-center text-center mb-6">
          <img src={logoArko} alt="Arko Consultoria Financeira" className="h-20 sm:h-20 lg:h-28 w-auto mb-6 lg:mb-8 mx-auto lg:mx-0" />
          <p className="text-sm font-medium text-brand-600 mb-1 flex items-center justify-center gap-1.5">
            <Sparkles className="h-4 w-4" /> Algumas perguntas rápidas
          </p>
          <h1 className="text-xl font-bold text-gray-900">Antes do seu diagnóstico</h1>
          <p className="text-sm text-gray-500 mt-1">
            Quanto mais contexto, mais preciso o resultado. Você pode pular quando quiser.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6">
          {/* progresso */}
          <p className="text-xs text-gray-400 mb-4">Pergunta {Math.min(turn, MAX_TURNS)} de até {MAX_TURNS}</p>

          {/* chat */}
          <div className="space-y-3 mb-5 max-h-[45vh] overflow-y-auto">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "rounded-2xl px-4 py-2.5 text-sm max-w-[85%]",
                    m.role === "user"
                      ? "bg-brand-600 text-white rounded-br-sm"
                      : "bg-gray-100 text-gray-800 rounded-bl-sm",
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {awaitingAi && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                </div>
              </div>
            )}
          </div>

          {/* input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canAnswer && input.trim()) askNext(input.trim());
            }}
            className="space-y-3"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canAnswer && input.trim()) askNext(input.trim());
                }
              }}
              placeholder="Digite sua resposta…"
              disabled={!canAnswer}
              rows={2}
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-50 disabled:text-gray-400"
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={!canAnswer || !input.trim()} className="flex-1">
                <Send className="h-4 w-4 mr-2" /> Responder
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => askNext(undefined, true)}>
                <SkipForward className="h-4 w-4 mr-2" /> Pular
              </Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">{children}</main>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-gray-600">
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
      <span className="font-medium">{label}</span>
    </div>
  );
}
