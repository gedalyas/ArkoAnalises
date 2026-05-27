/**
 * Modelo Gemini usado em todas as chamadas (categorização, questionário, diagnóstico).
 * Configurável por env para trocar sem mexer no código:
 *  - default "gemini-2.5-flash-lite" (free tier mais generoso, mais barato)
 *  - GEMINI_MODEL="gemini-2.5-flash" para mais qualidade (exige cota/billing maior)
 *
 * Lido em tempo de import — depende de o .env já ter sido carregado (dotenv/config
 * no boot do server e no topo dos scripts).
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";
