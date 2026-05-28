import { ShieldCheck, Sparkles, Calculator } from "lucide-react";
import { UploadStep } from "@/components/UploadStep";
import logoArko from "@/assets/logotipo-horizontal.png";

const BULLETS = [
  {
    icon: <Calculator className="h-5 w-5" />,
    title: "Números sem achismo",
    text: "Cada total é calculado sobre as transações reais do seu arquivo, a IA explica, não inventa.",
  },
  {
    icon: <Sparkles className="h-5 w-5" />,
    title: "Diagnóstico com plano de ação",
    text: "Veja para onde vai seu dinheiro, onde estão os vazamentos e o que fazer nos próximos 30 e 60 dias.",
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: "Sem cadastro, com privacidade",
    text: "Você não cria conta. Seus dados são analisados de forma segura e não são compartilhados.",
  },
];

export function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 py-8 sm:py-10 lg:p-8">
      <div className="w-full max-w-5xl grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-14">
        {/* Lado esquerdo — apresentação */}
        <div className="text-center lg:text-left">
          <img
            src={logoArko}
            alt="Arko Consultoria Financeira"
            className="h-20 sm:h-20 lg:h-28 w-auto mb-6 lg:mb-8 mx-auto lg:mx-0"
          />
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-brand-900 leading-tight">
            Entenda suas finanças <span className="text-brand-600">em minutos</span>
          </h1>
          <p className="mt-3 sm:mt-4 text-gray-600 text-base sm:text-lg leading-relaxed max-w-md mx-auto lg:mx-0">
            Envie sua fatura do cartão ou o extrato bancário e receba um diagnóstico
            financeiro feito por IA, direto ao ponto.
          </p>

          {/* Bullets — escondidos no mobile para encurtar o caminho até o formulário */}
          <ul className="mt-8 space-y-5 hidden lg:block">
            {BULLETS.map((b) => (
              <li key={b.title} className="flex gap-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  {b.icon}
                </span>
                <div>
                  <p className="font-semibold text-gray-900">{b.title}</p>
                  <p className="text-sm text-gray-500 leading-relaxed">{b.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Lado direito — formulário */}
        <div>
          <div className="bg-white rounded-2xl shadow-xl shadow-brand-900/5 border border-gray-100 p-5 sm:p-8">
            <div className="mb-6">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Diagnóstico Arko</h2>
              <p className="text-sm text-gray-500 mt-0.5">Preencha e envie seus arquivos para começar.</p>
            </div>
            <UploadStep />
          </div>

          {/* Bullets compactos no mobile (abaixo do formulário) */}
          <ul className="mt-6 space-y-3 lg:hidden">
            {BULLETS.map((b) => (
              <li key={b.title} className="flex items-center gap-2.5 justify-center">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                  {b.icon}
                </span>
                <p className="text-sm font-medium text-gray-700">{b.title}</p>
              </li>
            ))}
          </ul>

          <p className="text-center text-xs text-gray-400 mt-6">
            Seus dados são analisados de forma segura e não são compartilhados com terceiros.
          </p>
        </div>
      </div>
    </main>
  );
}
