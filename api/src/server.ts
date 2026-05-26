import "dotenv/config";
import { createApp } from "./app";

const PORT = process.env.PORT ?? 3333;

const app = createApp();

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});
