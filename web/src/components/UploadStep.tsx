import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreditCard, Building2, LayoutDashboard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { UploadZone } from "./UploadZone";
import { MultiUploadZone } from "./MultiUploadZone";
import { uploadFile, categorize } from "@/lib/api";

type Path = "card" | "bank" | "both";

const PATHS: { id: Path; icon: React.ReactNode; title: string; description: string }[] = [
  {
    id: "card",
    icon: <CreditCard className="h-6 w-6" />,
    title: "Só fatura(s) do cartão",
    description: "Uma ou mais faturas em PDF ou CSV",
  },
  {
    id: "bank",
    icon: <Building2 className="h-6 w-6" />,
    title: "Só extrato bancário",
    description: "PDF ou CSV do extrato da conta corrente",
  },
  {
    id: "both",
    icon: <LayoutDashboard className="h-6 w-6" />,
    title: "Fatura + extrato",
    description: "Análise mais completa — recomendado",
  },
];

export function UploadStep() {
  const navigate = useNavigate();

  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [path, setPath] = useState<Path | null>(null);
  const [cardFiles, setCardFiles] = useState<File[]>([]);
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    !loading &&
    leadName.trim().length > 0 &&
    leadEmail.trim().length > 0 &&
    path !== null &&
    (path === "bank" ? !!bankFile : cardFiles.length > 0) &&
    (path === "both" ? !!bankFile : true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!path || !canSubmit) return;
    setLoading(true);
    setError(null);

    // Monta a fila de uploads: faturas (1+) e/ou extrato (0-1).
    const fila: { file: File; source: "CREDIT_CARD" | "BANK" }[] = [];
    if (path !== "bank") cardFiles.forEach((f) => fila.push({ file: f, source: "CREDIT_CARD" }));
    if (path !== "card" && bankFile) fila.push({ file: bankFile, source: "BANK" });

    try {
      // O primeiro upload cria o Diagnosis (com nome/email); os demais anexam via diagnosisId.
      let diagnosisId: string | undefined;
      for (const u of fila) {
        const res = await uploadFile(
          u.file,
          u.source,
          diagnosisId,
          diagnosisId ? undefined : leadName,
          diagnosisId ? undefined : leadEmail,
        );
        diagnosisId = res.diagnosisId;
      }

      await categorize(diagnosisId!);
      navigate(`/d/${diagnosisId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar os arquivos.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Nome e email */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nome <span className="text-red-500">*</span></Label>
          <Input
            id="name"
            placeholder="Seu nome"
            value={leadName}
            onChange={(e) => setLeadName(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail <span className="text-red-500">*</span></Label>
          <Input
            id="email"
            type="email"
            placeholder="seu@email.com"
            value={leadEmail}
            onChange={(e) => setLeadEmail(e.target.value)}
            disabled={loading}
          />
        </div>
      </div>

      {/* Seleção do caminho */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">O que você vai enviar?</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PATHS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setPath(p.id); setCardFiles([]); setBankFile(null); }}
              disabled={loading}
              className={cn(
                "flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-colors",
                path === p.id
                  ? "border-brand-500 bg-brand-50"
                  : "border-gray-200 bg-white hover:border-gray-300",
                loading && "opacity-50 cursor-not-allowed",
              )}
            >
              <span className={cn(path === p.id ? "text-brand-600" : "text-gray-400")}>
                {p.icon}
              </span>
              <div>
                <p className={cn("text-sm font-semibold", path === p.id ? "text-brand-700" : "text-gray-800")}>
                  {p.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Zonas de upload (aparecem após selecionar o caminho) */}
      {path && (
        <div className={cn("grid gap-4", path === "both" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
          {path !== "bank" && (
            <MultiUploadZone
              label="Faturas do cartão"
              files={cardFiles}
              onChange={setCardFiles}
              disabled={loading}
            />
          )}
          {path !== "card" && (
            <UploadZone
              label="Extrato bancário"
              file={bankFile}
              onChange={setBankFile}
              disabled={loading}
            />
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
      )}

      <Button type="submit" disabled={!canSubmit} className="w-full" size="lg">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processando arquivos…
          </>
        ) : (
          "Analisar meus dados"
        )}
      </Button>
    </form>
  );
}
