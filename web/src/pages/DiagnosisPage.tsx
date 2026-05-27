import { useParams } from "react-router-dom";

export function DiagnosisPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <p className="text-gray-500">Diagnóstico <code>{id}</code> — em construção</p>
    </main>
  );
}
