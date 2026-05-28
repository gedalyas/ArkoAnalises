# CLAUDE.md — Diagnóstico Express (ArkoAnalises)

Leia este arquivo inteiro antes de qualquer ação. Ele descreve o estado exato do projeto.

---

## O que é esse projeto

**Diagnóstico Express** — app web público (sem login) para a Arko Consultoria.
Um lead "Perdido"/"Reciclagem" recebe um link, envia faturas de cartão (PDF) e/ou extrato bancário (PDF/CSV), responde um mini-questionário e recebe um diagnóstico financeiro gerado por IA.

Desafio técnico de 4 dias. O parceiro de programação é o usuário — avance em etapas e PARE em checkpoints para ele validar.

---

## Regra de Ouro (nunca violar)

- O PDF/CSV é parseado de forma **DETERMINÍSTICA** (sem LLM): cada transação vira `{id, rawLine, date, description, amount, category: null}`
- O LLM **só categoriza e raciocina** — nunca inventa valores
- Toda afirmação do LLM **cita os `id`s** das transações que a sustentam
- Todos os totais são **calculados em código**
- Se faltar dado, a IA diz que falta — **não estima**

---

## Stack obrigatória (versões exatas)

| Camada | Tecnologia |
|--------|-----------|
| Backend | Express **^4** (NÃO 5), TypeScript **^5**, Node **22** |
| ORM | Prisma **^6** |
| Banco | PostgreSQL no **Supabase** |
| Frontend | React **^19**, Vite **^8** (criado com create-vite — v7 incompatível com plugin-react v6), Tailwind **^4** |
| Tailwind setup | `@import "tailwindcss"` + plugin `@tailwindcss/vite` — **SEM** `tailwind.config.js` v3 |
| UI | Shadcn/ui |
| IA | Gemini com `responseSchema` — modelo via env `GEMINI_MODEL` (default **gemini-2.5-flash**; billing ativo, mais preciso). `gemini-2.5-flash-lite` p/ free tier |

---

## Estrutura de pastas

```
ArkoAnalises/
├── api/                        # Backend Express + TypeScript
│   ├── prisma/
│   │   ├── schema.prisma       # modelos Diagnosis e Transaction
│   │   └── migrations/
│   │       └── 20260526025815_init/
│   │           └── migration.sql   # primeira migration — tabelas criadas no Supabase
│   ├── src/
│   │   ├── ai/
│   │   │   ├── categories.ts       # taxonomia fechada + mapa categoria→tratamento (DESPESA/RENDA/NEUTRO)
│   │   │   ├── gemini.ts           # cliente Gemini + categorizeTransactions (responseSchema)
│   │   └── generateDiagnosis.ts # generateDiagnosis: 5 seções, totais pré-calculados em código
│   │   ├── diagnosis/
│   │   │   └── totals.ts           # totais calculados em código (|amount| por tratamento)
│   │   ├── parsers/
│   │   │   ├── types.ts            # ParsedTransaction (tipo do parser, sem Prisma)
│   │   │   ├── parsePdfNubank.ts   # FATURA cartão (PDF) — recebe source
│   │   │   ├── parseCsvNubank.ts   # FATURA cartão (CSV) — recebe source
│   │   │   ├── parseExtratoPdf.ts  # EXTRATO conta (PDF) — stateful, sinal pelo bloco
│   │   │   └── parseExtratoCsv.ts  # EXTRATO conta (CSV) — Data,Valor,Identificador,Descrição
│   │   ├── db.ts              # singleton do PrismaClient
│   │   ├── app.ts              # Express: POST /upload, /categorize, /questionnaire, /generate + GET /diagnoses/:id
│   │   └── server.ts           # sobe o servidor na porta 3333
│   ├── scripts/
│   │   ├── test-parse.ts       # roda os dois parsers nos fixtures e mostra totais
│   │   └── fixtures/           # PDF + CSV reais do Nubank para calibrar/testar
│   ├── .env                    # NÃO vai pro git — contém as credenciais reais
│   ├── .env.example            # template das variáveis de ambiente
│   ├── package.json
│   └── tsconfig.json
├── web/                        # Frontend React + Vite + Tailwind 4 + Shadcn/ui
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/                 # Shadcn/ui: button, card, badge, progress, separator, input, label
│   │   │   ├── UploadZone.tsx      # drag & drop de PDF/CSV (reutilizável)
│   │   │   ├── UploadStep.tsx      # formulário completo: nome*, email*, 3 caminhos, upload, submit
│   │   │   └── DiagnosisReport.tsx # relatório visual das 5 seções + totais
│   │   ├── lib/
│   │   │   ├── api.ts              # todas as chamadas ao backend (tipadas)
│   │   │   └── utils.ts            # cn() helper Tailwind
│   │   ├── pages/
│   │   │   ├── HomePage.tsx        # rota / — hero dividido (logo + pitch | card de upload), responsivo
│   │   │   └── DiagnosisPage.tsx   # rota /d/:id — máquina de estado: questionário → gerar → relatório
│   │   ├── assets/
│   │   │   └── logotipo-horizontal.png  # logo oficial da Arko (usada nas telas)
│   │   ├── App.tsx                 # BrowserRouter com rotas / e /d/:id
│   │   ├── main.tsx
│   │   ├── vite-env.d.ts           # /// <reference types="vite/client" /> — tipa import de imagens
│   │   └── index.css               # @import "tailwindcss" + @theme (paleta navy Arko + tokens Shadcn)
│   ├── components.json             # configuração Shadcn/ui
│   ├── vite.config.ts              # @tailwindcss/vite + proxy /api → :3333
│   ├── tsconfig.json
│   └── package.json
├── .gitignore                  # inclui .env, node_modules, dist
└── CLAUDE.md                   # este arquivo
```

---

## Variáveis de ambiente (api/.env)

O arquivo `api/.env` existe localmente mas não vai pro git.
O `api/.env.example` tem o template com as URLs corretas do Supabase.

```env
# Pooler Transaction Mode (porta 6543) — usado em RUNTIME
DATABASE_URL="postgresql://postgres.lwetcscbbzgcedbvhbzy:[PASSWORD]@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Pooler Session Mode (porta 5432) — usado SOMENTE nas migrations
DIRECT_URL="postgresql://postgres.lwetcscbbzgcedbvhbzy:[PASSWORD]@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

PORT=3333
```

**Supabase:** projeto `ArkoAnalises`, region `us-east-1`, project ID `lwetcscbbzgcedbvhbzy`

---

## Dependências instaladas (api/)

**dependencies (api/):**
- `express` ^4.19.2
- `@prisma/client` ^6.19.3
- `pdf-parse` ^2.4.5 — **v2** (API por classe `PDFParse`, traz tipos próprios)
- `multer` ^2.1.1 — upload `multipart/form-data` em memória
- `@google/genai` ^2.6.0 — SDK Gemini (categorização + diagnóstico + questionário)

**devDependencies (api/):**
- `prisma` ^6.19.3
- `typescript` ^5.5.0
- `tsx` ^4.19.0
- `@types/express` ^4.17.21
- `@types/node` ^22.0.0
- `@types/multer` ^2.1.0
- `@types/pdf-parse` ^1.1.5 — tipagem da v1; **não usada** (a v2 já tipa). Inofensiva.

**dependencies (web/):**
- `react` ^19, `react-dom` ^19
- `react-router-dom` ^7
- `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority` — utilitários Shadcn
- `@radix-ui/react-label`, `@radix-ui/react-progress`, `@radix-ui/react-separator`, `@radix-ui/react-slot`

**devDependencies (web/):**
- `vite` ^8, `@vitejs/plugin-react` ^6
- `@tailwindcss/vite` ^4, `tailwindcss` ^4
- `typescript` ^5, `@types/react` ^19, `@types/react-dom` ^19

---

## Scripts disponíveis (api/)

```bash
npm run dev          # inicia o servidor com hot-reload (tsx watch)
npm run build        # compila TypeScript para dist/
npm run start        # roda o build compilado
npm run test:parse   # roda scripts/test-parse.ts (ainda não criado)
```

---

## Schema Prisma (api/prisma/schema.prisma)

### Modelo `Diagnosis`
Representa uma sessão de análise completa.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `String @id @default(cuid())` | ID único URL-safe |
| `createdAt` | `DateTime @default(now())` | criação |
| `updatedAt` | `DateTime @updatedAt` | última atualização |
| `deletedAt` | `DateTime?` | soft-delete para LGPD |
| `leadName` | `String?` | nome do lead (opcional) |
| `leadEmail` | `String?` | email do lead (opcional) |
| `questionnaire` | `Json?` | histórico da conversa: `[{role: "ai"\|"user", text: string}]` |
| `status` | `DiagnosisStatus` | ciclo de vida: PENDING → PROCESSING → DONE \| ERROR |
| `result` | `Json?` | diagnóstico completo (5 seções) — preenchido quando DONE |
| `errorMsg` | `String?` | mensagem de erro quando ERROR |

### Modelo `Transaction`
Uma linha extraída deterministicamente do PDF/CSV.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `String @id @default(cuid())` | ID citado pelo LLM para rastreabilidade |
| `createdAt` | `DateTime @default(now())` | |
| `diagnosisId` | `String` | FK para Diagnosis (onDelete: Cascade) |
| `rawLine` | `String` | linha original intacta — nunca modificada |
| `date` | `DateTime` | data parseada deterministicamente |
| `description` | `String` | descrição como veio no arquivo |
| `amount` | `Decimal @db.Decimal(12,2)` | valor sem erro de ponto flutuante |
| `source` | `TransactionSource` | CREDIT_CARD ou BANK |
| `category` | `String?` | null até o LLM categorizar — nunca o parser |

### Enums
- `DiagnosisStatus`: `PENDING`, `PROCESSING`, `DONE`, `ERROR`
- `TransactionSource`: `CREDIT_CARD`, `BANK`

---

## Scripts disponíveis (web/)

```bash
npm run dev      # Vite dev server em http://localhost:5173
npm run build    # tsc + vite build
npm run preview  # preview do build
```

O Vite está configurado com proxy: `/api/*` → `http://localhost:3333/*` (sem CORS em dev).

---

## O que foi feito (Dia 1)

- [x] **Passo 1** — Estrutura monorepo `/api` e `/web`
- [x] **Passo 2** — Backend Express ^4 + TS ^5 + tsx, `GET /health` na porta 3333
- [x] **Passo 3** — `schema.prisma` com modelos `Diagnosis` e `Transaction`
- [x] **Passo 4** — Projeto Supabase criado (`ArkoAnalises`, us-east-1) + `.env.example`
- [x] **Passo 5** — Primeira migration rodada (`prisma migrate dev --name init`) — tabelas criadas no Supabase
- [x] **Passo 6** — `POST /upload` (multer em memória) detecta PDF vs CSV e parseia. Parsers determinísticos calibrados na saída REAL do `pdf-parse` v2 e no CSV. **Ainda não grava no banco** — só retorna as transações.
- [x] **Passo 7** — `scripts/test-parse.ts` roda os dois fixtures. Validação: totais calculados em código (despesas R$ 1.400,29 / pagamentos −R$ 1.586,49) batem com os subtotais impressos na fatura.
- [x] **Passo 8** — `POST /upload` persiste no Postgres. Campos: `file` + `source` (obrigatório, CREDIT_CARD|BANK — frontend decide) + `diagnosisId` (opcional, anexa à mesma sessão; senão cria novo). `source` escolhe a família de parser, a extensão escolhe PDF vs CSV. Cria `Diagnosis` com `transactions` aninhadas (id = cuid). Testado e2e contra o Supabase; dados de teste limpos depois.
- [x] **Passo 9** — Parsers de EXTRATO bancário (PDF + CSV). Calibrados no extrato real; ambos = 22 transações, entradas +8.556,34 / saídas −8.556,34, batendo com os totais impressos.
- [x] **Passo 10** — Categorização via Gemini (`gemini-2.5-flash`, `responseSchema`, temperature 0). Endpoint `POST /diagnoses/:id/categorize`: LLM só classifica (taxonomia fechada), código grava `category` e calcula totais (`computeTotals`). Validado e2e: RDB/auto-transferência → NEUTRO; pagamento de fatura → NEUTRO (sem dupla contagem); gasto real R$ 4.445,92.
- [x] **Passo 11** — Geração do diagnóstico completo (5 seções) via Gemini. Endpoint `POST /diagnoses/:id/generate`: totais calculados em código (`computeTotals`) e enviados prontos ao LLM — o LLM só gera narrativa e cita `id`s das transações. Bloqueia com 400 se houver transações sem categoria. Grava em `Diagnosis.result` e seta status DONE (ou ERROR em falha). Funciona nos 3 cenários: só fatura, só extrato, ou ambos — quando `rendaTotal = 0` o LLM observa que renda não foi identificada nos dados.

---

## O que foi feito (Dia 2)

- [x] **Passo 11** — Geração do diagnóstico completo (5 seções) via Gemini. Endpoint `POST /diagnoses/:id/generate`: totais calculados em código (`computeTotals`) e enviados prontos ao LLM — o LLM só gera narrativa e cita `id`s das transações. Bloqueia com 400 se houver transações sem categoria. Grava em `Diagnosis.result` e seta status DONE (ou ERROR em falha). Funciona nos 3 cenários: só fatura, só extrato, ou ambos — quando `rendaTotal = 0` o LLM observa que renda não foi identificada nos dados.
- [x] **Passo 12** — Questionário dinâmico (conversa IA ↔ lead), grava em `Diagnosis.questionnaire`. Endpoint `POST /diagnoses/:id/questionnaire`: body `{ answer?, skip? }`. LLM decide próxima pergunta (máx 5 turnos) com base nas lacunas dos dados. `skip: true` encerra sem resposta. Frontend libera o /generate quando receber `done: true`.
- [x] **Passo 13** — Frontend base: Vite 8 + React 19 + Tailwind 4 + Shadcn/ui configurados. Roteamento com `react-router-dom` (rotas `/` e `/d/:id`). Proxy Vite → API na porta 3333.
- [x] **Passo 14** — Tela de upload (`/`): campos nome* e email* obrigatórios, seleção dos 3 caminhos (só cartão / só extrato / ambos), zonas de drag & drop por arquivo, botão desabilitado até tudo preenchido. Ao submeter: faz upload → categoriza → navega para `/d/:id`. Backend validado para exigir `leadName` e `leadEmail` no primeiro upload.

---

## O que falta (continuar a partir daqui)

- [x] **Passo 15** — `DiagnosisPage` (`/d/:id`): máquina de estado (loading → questionário → gerando → relatório/erro). Chat com a IA (bolhas, máx 5 perguntas, botão "pular"), depois `DiagnosisReport` com as 5 seções + totais e citação das transações. Backend ganhou `GET /diagnoses/:id`; client ganhou `getDiagnosis`. Validado e2e (upload→categorize→questionnaire→generate→GET) e `vite build` ok.
- [x] **Passo 16** — Identidade visual: logo da Arko nas telas, paleta navy + tokens do Shadcn definidos no `@theme` do `index.css` (antes `bg-primary` etc. não tinham cor), home como hero dividido e tudo responsivo no mobile. Resiliência no Gemini (`ai/retry.ts`) e fix da categorização (titular → auto-transferência vira NEUTRO, não Renda).
- [ ] **Futuro (pós-MVP)** — Suporte a extratos de OUTROS bancos além do Nubank. Hoje os 4 parsers são calibrados só no Nubank. Generalizar exige: detectar o banco/layout, um parser por banco (ou um genérico configurável) e fixtures reais de cada banco para calibrar.
- [ ] **Dia 3+** — Deploy: API no Railway, Frontend na Vercel
- [ ] **Dia 3+** — README final (decisões de arquitetura, LGPD, o que cortaria/adicionaria)

---

## Como rodar localmente

```bash
# --- API ---
cd api
npm install
# criar api/.env com as credenciais do Supabase (ver .env.example) + GEMINI_API_KEY
npx prisma migrate dev   # só se o banco estiver vazio
npm run dev
# → http://localhost:3333
# → GET /health retorna { status: "ok", service: "diagnostico-express-api" }

# --- Frontend (outro terminal) ---
cd web
npm install
npm run dev
# → http://localhost:5173
```

O frontend usa proxy Vite: chamadas para `/api/*` vão para `http://localhost:3333/*` automaticamente.

---

## Decisões de arquitetura tomadas

- **`amount` como `Decimal`** e não `Float` — evita erro de ponto flutuante em somas financeiras
- **`rawLine`** gravado em todas as transactions — permite auditoria e citação pelo LLM
- **`category` nullable** — o parser nunca categoriza; só o LLM
- **`questionnaire` como `Json`** — armazena o histórico completo da conversa (síncrona) com a IA
- **`deletedAt`** no schema desde o início — soft-delete para LGPD sem migration futura
- **`DATABASE_URL`** no pooler Transaction Mode — compatível com serverless/Railway
- **`DIRECT_URL`** no pooler Session Mode — necessário para migrations que precisam de conexão persistente
- **Sinal NATIVO por documento** (não há convenção global): o parser copia o sinal como a fonte entrega.
  - `CREDIT_CARD` (fatura): despesa +, pagamento/estorno −. "Total gasto" = soma dos amounts > 0.
  - `BANK` (extrato): fluxo de caixa, entrada +, saída −.
  - Logo o sinal significa coisas diferentes conforme o `source` — é o `source` que desambigua. Escolhido por minimizar transformação (mais determinístico).
- **Extrato é cheio de ruído interno** — `Aplicação/Resgate RDB` e Pix entre as contas do próprio dono (auto-transferência) inflam entradas/saídas mas NÃO são renda/despesa. O parser não decide isso (preserva a descrição com a contraparte); **o LLM neutraliza** na categorização.
- **Risco de dupla contagem cartão × extrato**: o `-940,29 Pagamento de fatura` no extrato é a MESMA grana das transações da fatura. Somar os dois conta o gasto duas vezes — o LLM precisa tratar (anotado para o Dia 2).
- **Parser calibrado na saída REAL do `pdf-parse`**, não no layout visual do PDF. Compra internacional ocupa 4 linhas (desc / USD / Conversão / R$ isolado); linhas de subtotal são ignoradas por não começarem com `DD MMM`. Ano inferido do cabeçalho `FATURA DD MMM AAAA`
- **Pagamento de fatura ≠ despesa ≠ renda** — as linhas negativas ("Pagamento recebido"/"Pagamento em XX") são o usuário quitando o cartão, não receita. O parser só grava o sinal cru (não rotula). Na categorização, o **LLM** marca como categoria própria "Pagamento de fatura" e a **exclui do total de despesas e da análise de consumo**; serve só para indicar se a fatura foi quitada. O total de consumo do mês é a soma das despesas (amount > 0)
- **IOF herda a categoria da compra (em código, não no LLM)** — uma linha `IOF de "X"` é a taxa da compra X e recebe a MESMA categoria de X. Feito por pós-processamento determinístico em `categorizeTransactions` (casa pela descrição/source), mais confiável do que pedir o casamento ao LLM.
- **Guia de categorias no prompt + modelo flash** — `Educação` cobre cursos/idiomas mesmo sendo assinatura (Open English, Asimov); `Assinaturas e Software` cobre SaaS/ferramentas (Lovable, Render, Canva). O `flash-lite` errava Lovable→Compras; o `gemini-2.5-flash` (default, com billing) acerta.
- **Categorização recebe o `leadName` como "titular da conta"** — sem essa dica, o LLM (sobretudo o `flash-lite`) confunde "Transferência recebida pelo Pix <nome-do-próprio-titular>" (auto-transferência) com Renda, inflando a renda com dinheiro que o dono só moveu entre contas dele. Com o nome do titular no prompt, recebidas E enviadas da própria pessoa caem em "Movimentação Interna". Bug real flagrado no teste; renda caiu de R$ 3.581,34 (falsa) para R$ 0 (correto).
- **Tokens do Shadcn definidos no `@theme` (Tailwind 4)** — os componentes usam `bg-primary`, `border-input`, `ring-ring` etc., que não existiam (o `index.css` só tinha `@import`). Foram definidos em `@theme` junto da paleta `brand-*` (navy da Arko); `primary` = navy. Sem isso os botões/cards ficavam sem cor. Imports de imagem exigem `src/vite-env.d.ts` (`vite/client`).
- **Retry com backoff nas chamadas ao Gemini** (`ai/retry.ts`, `withRetry`) — a API retorna 503/`UNAVAILABLE` ("high demand") e 429 de forma transitória; categorize/questionnaire/generate retentam até 4x (1s,2s,4s + jitter). Erros 4xx definitivos não são retentados. A `DiagnosisPage` ainda oferece "Tentar novamente" se tudo falhar.
- **`ParsedTransaction` (parsers/types.ts) é separado do model Prisma** — o parser gera `id` sequencial em memória (`t1`, `t2`); o id definitivo (cuid) só nasce ao persistir no Passo 8
