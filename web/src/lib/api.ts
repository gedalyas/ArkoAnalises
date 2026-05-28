// Em dev: "/api" (proxy do Vite → :3333). Em produção: URL da API na Railway
// (defina VITE_API_URL na Vercel, ex: https://sua-api.up.railway.app — sem barra no fim).
const BASE = import.meta.env.VITE_API_URL ?? "/api";

export type UploadResponse = {
  diagnosisId: string;
  count: number;
};

export type QuestionnaireResponse = {
  question: string | null;
  done: boolean;
  turn: number;
};

export type DiagnosisResult = {
  totais: {
    rendaTotal: number;
    rendaInformada: number | null;
    rendaConsiderada: number;
    despesaTotal: number;
    saldoLivre: number;
    taxaPoupanca: number | null;
    despesaPorCategoria: Record<string, number>;
  };
  categorizacao: {
    resumo: string;
    destaques: Array<{ categoria: string; observacao: string; transacaoIds: string[] }>;
  };
  vazamentos: {
    resumo: string;
    itens: Array<{ descricao: string; transacaoIds: string[]; sugestao: string }>;
  };
  balanco: { observacao: string };
  plano30dias: { acoes: Array<{ acao: string; transacaoIds: string[] }> };
  plano60dias: { acoes: Array<{ acao: string }> };
};

export type DiagnosisStatus = "PENDING" | "PROCESSING" | "DONE" | "ERROR";

export type QuestionnaireMessage = {
  role: "ai" | "user";
  text: string | null;
  done?: boolean;
};

export type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: string; // Decimal serializado como string pelo Prisma
  source: "CREDIT_CARD" | "BANK";
  category: string | null;
};

export type DiagnosisState = {
  id: string;
  status: DiagnosisStatus;
  result: DiagnosisResult | null;
  errorMsg: string | null;
  questionnaire: QuestionnaireMessage[] | null;
  transactions: Transaction[];
};

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, options);
  } catch {
    throw new Error("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.");
  }

  // Lê como texto primeiro: respostas vazias (ex: cold start / 502 do edge) ou
  // não-JSON não devem quebrar com "Unexpected end of JSON input".
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      /* corpo não-JSON (ex: página de erro do proxy) */
    }
  }

  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error;
    throw new Error(msg ?? `O servidor respondeu com erro ${res.status}. Tente novamente em instantes.`);
  }
  if (data === null) {
    throw new Error("O servidor demorou para responder (pode estar iniciando). Tente novamente em instantes.");
  }
  return data as T;
}

export async function uploadFile(
  file: File,
  source: "CREDIT_CARD" | "BANK",
  diagnosisId?: string,
  leadName?: string,
  leadEmail?: string,
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("source", source);
  if (diagnosisId) form.append("diagnosisId", diagnosisId);
  if (leadName) form.append("leadName", leadName);
  if (leadEmail) form.append("leadEmail", leadEmail);
  return req<UploadResponse>("/upload", { method: "POST", body: form });
}

export async function categorize(diagnosisId: string): Promise<void> {
  await req(`/diagnoses/${diagnosisId}/categorize`, { method: "POST" });
}

export async function sendQuestionnaireAnswer(
  diagnosisId: string,
  answer?: string,
  skip?: boolean,
): Promise<QuestionnaireResponse> {
  return req<QuestionnaireResponse>(`/diagnoses/${diagnosisId}/questionnaire`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer, skip }),
  });
}

export async function generateDiagnosis(diagnosisId: string): Promise<{ result: DiagnosisResult }> {
  return req<{ result: DiagnosisResult }>(`/diagnoses/${diagnosisId}/generate`, { method: "POST" });
}

export async function getDiagnosis(diagnosisId: string): Promise<DiagnosisState> {
  return req<DiagnosisState>(`/diagnoses/${diagnosisId}`);
}
