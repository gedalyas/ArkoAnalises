const BASE = "/api";

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

export type DiagnosisState = {
  id: string;
  status: DiagnosisStatus;
  result: DiagnosisResult | null;
  errorMsg: string | null;
  questionnaire: QuestionnaireMessage[] | null;
};

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Erro ${res.status}`);
  return json as T;
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
