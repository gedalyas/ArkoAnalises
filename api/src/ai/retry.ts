/**
 * Erros transitórios da API do Gemini que valem retry:
 *  - 503 UNAVAILABLE  → modelo sobrecarregado ("high demand"/"overloaded")
 *  - 429 RESOURCE_EXHAUSTED → rate limit momentâneo
 *  - 500 INTERNAL     → erro interno esporádico
 * Erros de 4xx "definitivos" (chave inválida, prompt inválido) NÃO são retentados.
 */
function isTransient(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();

  // Cota DIÁRIA do free tier estourada NÃO é transitória — só zera no reset do dia.
  // Retentar é inútil e só atrasa o erro, então tratamos como definitivo.
  const isDailyQuota =
    msg.includes("perday") ||
    msg.includes("requests per day") ||
    msg.includes("free_tier") ||
    msg.includes("free tier") ||
    msg.includes("check your plan and billing");
  if (isDailyQuota) return false;

  return (
    msg.includes("503") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("high demand") ||
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("500") ||
    msg.includes("internal error")
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Executa `fn`, retentando em erros transitórios com backoff exponencial + jitter.
 * Por padrão: até 4 tentativas (≈ 1s, 2s, 4s entre elas). Erros não-transitórios
 * ou o estouro das tentativas propagam o erro original.
 */
export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let delay = 1000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxAttempts || !isTransient(err)) throw err;
      const jitter = Math.floor(Math.random() * 300);
      await sleep(delay + jitter);
      delay *= 2;
    }
  }
}
