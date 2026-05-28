import type { QuestionnaireMessage } from "../ai/questionnaire";

/**
 * Converte um texto livre em pt-BR para um valor numérico de renda.
 * Cobre os jeitos comuns que a pessoa digita: "8000", "8.000", "8000,50",
 * "R$ 8.000,00", "8 mil", "8mil", "8k", "5,5 mil", "uns 5 mil".
 * Determinístico — não usa LLM. Retorna null se não achar número plausível.
 */
export function parseBrlAmount(raw: string): number | null {
  const t = raw.toLowerCase().replace(/r\$\s*/g, "");

  // Com multiplicador "mil"/"k": o número antes pode ter decimal por vírgula.
  const mil = t.match(/(\d+(?:[.,]\d+)?)\s*(mil|k)\b/);
  if (mil) {
    const n = Number(mil[1].replace(".", "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n * 1000 : null;
  }

  // Número "puro" em formato BR: 8.000,00 / 8000 / 8000,50
  const num = t.match(/\d[\d.]*(?:,\d{1,2})?/);
  if (!num) return null;
  const n = Number(num[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Extrai a renda mensal que o lead INFORMOU no questionário (texto livre).
 * Procura a pergunta da IA que menciona "renda" e lê a resposta seguinte do usuário.
 * Retorna null se o questionário não foi respondido ou não há valor.
 */
export function extractRendaInformada(questionnaire: unknown): number | null {
  if (!Array.isArray(questionnaire)) return null;
  const msgs = questionnaire as QuestionnaireMessage[];

  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role === "ai" && m.text && /renda/i.test(m.text)) {
      const answer = msgs.slice(i + 1).find((x) => x.role === "user" && x.text);
      if (answer?.text) {
        const value = parseBrlAmount(answer.text);
        if (value) return value;
      }
    }
  }
  return null;
}
