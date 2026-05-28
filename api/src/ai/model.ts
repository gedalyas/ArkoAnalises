/**
 * Modelo Gemini usado em todas as chamadas (categorização, questionário, diagnóstico).
 * Configurável por env para trocar sem mexer no código:
 *  - default "gemini-2.5-flash" (melhor na categorização; exige billing/cota maior)
 *  - GEMINI_MODEL="gemini-2.5-flash-lite" se precisar ficar no free tier (menos preciso)
 *
 * Lido em tempo de import — depende de o .env já ter sido carregado (dotenv/config
 * no boot do server e no topo dos scripts).
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
