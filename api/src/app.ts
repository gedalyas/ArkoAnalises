import express, { Express } from "express";

/**
 * Monta o app Express (middlewares + rotas) SEM subir o servidor.
 * Separado de server.ts pra poder ser importado em testes/scripts.
 */
export function createApp(): Express {
  const app = express();

  app.use(express.json());

  // Checkpoint do passo 2: prova que o servidor está de pé.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "diagnostico-express-api" });
  });

  return app;
}
