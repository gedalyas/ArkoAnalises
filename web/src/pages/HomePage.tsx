import { UploadStep } from "@/components/UploadStep";

export function HomePage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-start justify-center p-4 pt-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-sm font-medium text-blue-600 mb-2">Arko Consultoria</p>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Diagnóstico Express</h1>
          <p className="text-gray-500 max-w-md mx-auto">
            Envie sua fatura ou extrato bancário e receba um diagnóstico financeiro
            personalizado em minutos — sem cadastro.
          </p>
        </div>

        {/* Card do formulário */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <UploadStep />
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Seus dados são analisados de forma segura e não são compartilhados com terceiros.
        </p>
      </div>
    </main>
  );
}
