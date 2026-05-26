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
| Frontend | React **^19**, Vite **^7**, Tailwind **^4** |
| Tailwind setup | `@import "tailwindcss"` + plugin `@tailwindcss/vite` — **SEM** `tailwind.config.js` v3 |
| UI | Shadcn/ui |
| IA | Gemini **gemini-2.5-flash** com `responseSchema` |

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
│   │   ├── app.ts              # cria o app Express (middlewares + rotas)
│   │   └── server.ts           # sobe o servidor na porta 3333
│   ├── scripts/                # pasta para scripts de teste (ex: test-parse.ts)
│   ├── .env                    # NÃO vai pro git — contém as credenciais reais
│   ├── .env.example            # template das variáveis de ambiente
│   ├── package.json
│   └── tsconfig.json
├── web/                        # Frontend (ainda vazio)
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

**dependencies:**
- `express` ^4.19.2
- `@prisma/client` ^6.19.3

**devDependencies:**
- `prisma` ^6.19.3
- `typescript` ^5.5.0
- `tsx` ^4.19.0
- `@types/express` ^4.17.21
- `@types/node` ^22.0.0

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

## O que foi feito (Dia 1)

- [x] **Passo 1** — Estrutura monorepo `/api` e `/web`
- [x] **Passo 2** — Backend Express ^4 + TS ^5 + tsx, `GET /health` na porta 3333
- [x] **Passo 3** — `schema.prisma` com modelos `Diagnosis` e `Transaction`
- [x] **Passo 4** — Projeto Supabase criado (`ArkoAnalises`, us-east-1) + `.env.example`
- [x] **Passo 5** — Primeira migration rodada (`prisma migrate dev --name init`) — tabelas criadas no Supabase

---

## O que falta (continuar a partir daqui)

- [ ] **Passo 6** — `POST /upload` com parser determinístico via `pdf-parse` calibrado para fatura do Nubank
- [ ] **Passo 7** — Script `scripts/test-parse.ts` para testar o parser no console
- [ ] **Dia 2+** — Frontend React + Vite + Tailwind 4 + Shadcn/ui
- [ ] **Dia 2+** — Integração com Gemini gemini-2.5-flash (questionário dinâmico + diagnóstico)
- [ ] **Dia 3+** — Deploy: API no Railway, Frontend na Vercel

---

## Como rodar localmente

```bash
# 1. instalar dependências
cd api && npm install

# 2. criar api/.env com as credenciais do Supabase (ver .env.example)

# 3. aplicar migrations (se o banco estiver vazio)
npx prisma migrate dev

# 4. subir o servidor
npm run dev
# → API em http://localhost:3333
# → GET /health deve retornar { status: "ok", service: "diagnostico-express-api" }
```

---

## Decisões de arquitetura tomadas

- **`amount` como `Decimal`** e não `Float` — evita erro de ponto flutuante em somas financeiras
- **`rawLine`** gravado em todas as transactions — permite auditoria e citação pelo LLM
- **`category` nullable** — o parser nunca categoriza; só o LLM
- **`questionnaire` como `Json`** — armazena o histórico completo da conversa (síncrona) com a IA
- **`deletedAt`** no schema desde o início — soft-delete para LGPD sem migration futura
- **`DATABASE_URL`** no pooler Transaction Mode — compatível com serverless/Railway
- **`DIRECT_URL`** no pooler Session Mode — necessário para migrations que precisam de conexão persistente
