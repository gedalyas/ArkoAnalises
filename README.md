# Diagnóstico Express — Arko Consultoria

App web público (sem login) que recebe **1+ faturas de cartão (PDF/CSV)** e/ou **um extrato bancário (PDF/CSV)**, faz um **mini-questionário guiado por IA** e gera um **diagnóstico financeiro** com plano de ação, sem nunca inventar valores.

- **Aplicação hospedada:** https://arko-analises.vercel.app
- **Repositório:** https://github.com/gedalyas/ArkoAnalises
- **API:** https://arkoanalises-production.up.railway.app

---

## Arquivos de exemplo (para testar)

Na pasta [`examples/`](examples/) há uma fatura e um extrato reais (do próprio desenvolvedor, com CPF mascarado), em **PDF e CSV**, prontos para upload:

- [`examples/fatura-cartao.pdf`](examples/fatura-cartao.pdf) / [`.csv`](examples/fatura-cartao.csv) — fatura de cartão Nubank.
- [`examples/extrato-conta.pdf`](examples/extrato-conta.pdf) / [`.csv`](examples/extrato-conta.csv) — extrato de conta Nubank.

**Como testar:** abra a aplicação, escolha "Só fatura(s) do cartão" (ou "Fatura + extrato") e envie um dos arquivos acima (PDF ou CSV).
Se usar o extrato, digite **`Davi Almeida Souto`** no campo Nome, assim a IA reconhece as transferências dele para as próprias contas como movimentação interna (e não como renda).

---

## Como rodar localmente

Pré-requisitos: Node 22+, um banco PostgreSQL (usei Supabase) e uma `GEMINI_API_KEY` (Google AI Studio).

```bash
# 1) Backend
cd api
npm install
cp .env.example .env        # preencha DATABASE_URL, DIRECT_URL e GEMINI_API_KEY
npx prisma migrate dev      # cria as tabelas (só se o banco estiver vazio)
npm run dev                 # API em http://localhost:3333

# 2) Frontend (em outro terminal)
cd web
npm install
npm run dev                 # app em http://localhost:5173
```

Em desenvolvimento o Vite faz proxy de `/api/*` → `:3333` (sem CORS). Em produção, o front lê a URL da API de `VITE_API_URL`.

Variáveis principais (`api/.env`): `DATABASE_URL`, `DIRECT_URL` (Supabase), `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-2.5-flash`), `WEB_ORIGIN` (CORS).

---

## Decisões de arquitetura

### Como lido com alucinação (a decisão central)
A confiabilidade é o requisito que mais importa. A arquitetura separa **cálculo** de **raciocínio**:

- O PDF/CSV é parseado de forma **100% determinística (sem LLM)**. Cada transação vira `{ rawLine, date, description, amount, source, category: null }`.
- O **LLM só categoriza e escreve a narrativa** — nunca inventa, altera ou estima números.
- **Todos os totais são somados em código** (`computeTotals`), nunca pelo modelo. Os números prontos são enviados ao LLM, que apenas os explica.
- **Toda afirmação cita as transações** que a sustentam: o relatório mostra a descrição + valor das linhas por trás de cada destaque, vazamento e ação (a IA devolve os `id`s; o front renderiza as linhas reais).
- Saídas estruturadas via **`responseSchema`** do Gemini (JSON com enum de categorias fechado) — o modelo não consegue devolver categoria fora da lista.
- Quando um dado falta (ex: renda não aparece nos documentos), a IA **diz que falta** em vez de estimar.

### Por que esse parser de PDF
Uso o **`pdf-parse` (v2)** e calibro os parsers na **saída real de texto** do `pdf-parse`, não no layout visual do PDF. Motivos:

- É **determinístico e auditável** — extrai texto sem depender de modelo, então o mesmo arquivo sempre gera as mesmas transações.
- O texto extraído tem padrões estáveis (`DD MMM`, blocos "Total de entradas/saídas", linhas de subtotal) que dá para parsear com regex e máquina de estado.
- Casos tratados na calibração: compra internacional ocupa várias linhas (descrição / USD / conversão / R$); o extrato é **stateful** (o sinal vem do bloco "entradas/saídas"); linhas de subtotal são ignoradas para não duplicar valores.
- O `amount` é gravado como **`Decimal`** (não `float`), evitando erro de ponto flutuante em somas financeiras.

### Por que essa LLM (Gemini)
- **`responseSchema` nativo** (saída JSON tipada com enum) reduz drasticamente a chance de o modelo "escapar" do formato — essencial para a Regra de Ouro.
- **Custo/latência** muito baixos no `gemini-2.5-flash`, adequado a um app público de uso pontual; o `flash` acerta melhor categorias de produtos novos (ex: ferramentas SaaS) que o `flash-lite` errava.
- Modelo **trocável por env** (`GEMINI_MODEL`) sem mexer no código.
- **Resiliência**: retry com backoff em erros transitórios (503/429); cota diária esgotada não é retentada (falha rápido com mensagem clara).

### Outras decisões
- **Sinal nativo por documento** (sem convenção global): o parser copia o sinal como a fonte entrega; o campo `source` (CREDIT_CARD/BANK) desambigua.
- **Ruído do extrato neutralizado pelo LLM**: `Aplicação/Resgate RDB` e Pix entre contas do próprio titular inflam os totais brutos mas não são renda/despesa → categoria "Movimentação Interna"/"Investimento".
- **Sem dupla contagem cartão × extrato**: o "Pagamento de fatura" no extrato é a mesma grana das compras do cartão → tratado como neutro.
- **IOF herda a categoria da compra** (feito em código, determinístico).
- **Renda informada no questionário** entra no cálculo de saldo livre / taxa de poupança (extraída do texto em código) e é rotulada como "informada", deixando claro que não veio dos documentos.
- **Questionário à prova de corrida**: guard no front + escrita atômica (concorrência otimista por `updatedAt`) no back.

---

## O que eu cortaria (metade do tempo) e adicionaria (o dobro)

**Com metade do tempo, cortaria:**
- O **questionário dinâmico**, entregaria o diagnóstico só com os dados das transações (a coleta de lacunas é incremento, não o núcleo).
- A **camada visual** mais elaborada (paleta de marca, hero responsivo), um relatório simples já provaria o valor.
- O **parser de PDF do extrato** (o mais trabalhoso), manteria só fatura PDF + CSVs.
- **Não cortaria** a separação cálculo/raciocínio nem a citação das linhas, é o que sustenta a confiança.

**Com o dobro do tempo, adicionaria:**
- **Suporte multi-banco** (hoje calibrado só no Nubank): detecção de layout + um parser por banco, com fixtures reais de cada um.
- **Processamento assíncrono** do diagnóstico (fila + status PROCESSING/DONE com polling), em vez de bloquear a requisição.
- **Testes automatizados** dos parsers e do `computeTotals` (os totais batem com os subtotais impressos nas faturas, daria para travar isso em CI).
- **Histórico de diagnósticos** por lead e exportação em PDF.

---

## LGPD e retenção de dados

- **Coleta mínima e sem cadastro**: apenas nome e e-mail do lead, mais os arquivos que ele escolhe enviar.
- **Soft-delete** (`deletedAt`) no schema desde o início: permite atender pedido de exclusão (direito do titular) sem migration; consultas já filtram `deletedAt: null`.
- **Arquivos processados em memória** (`multer` em memória), o PDF/CSV não é gravado em disco no servidor; persistem apenas as transações estruturadas necessárias para o diagnóstico.
- **Dados não compartilhados** com terceiros. O único processamento externo é o envio do **texto já extraído e anonimizável** ao Gemini para categorização/narrativa.
- **Segredos só em variáveis de ambiente** (`.env` fora do versionamento); a chave do Gemini nunca aparece no código nem no bundle do cliente.
- **Dados de leads nunca são versionados**: faturas/extratos enviados em testes ficam em `api/scripts/fixtures/`, que está no `.gitignore`, e os parsers usam padrões estruturais (sem nomes/contas fixos no código). Os arquivos em `examples/` são extratos/faturas do **próprio desenvolvedor** (CPF mascarado), incluídos com consentimento apenas para o avaliador testar.
- **Retenção**: para um MVP, os diagnósticos ficam no banco para o lead reabrir pelo link. Em produção, o passo natural é uma **política de expiração** (ex: purgar via `deletedAt` após N dias) — fácil de ligar porque o soft-delete já existe.

---

## Estrutura

```
api/   # Express + TS: parsers determinísticos, Prisma, endpoints (upload, categorize, questionnaire, generate, GET)
web/   # React + Vite + Tailwind 4 + Shadcn: tela de upload e relatório do diagnóstico
examples/  # faturas/extratos fictícios para teste
```
