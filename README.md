# OpenWallet — Impostômetro

Mostra, para cada gasto, quanto do valor pago foi imposto: federal, estadual (ICMS, conforme a UF) e municipal (ISS).
Os percentuais seguem a lógica da tabela IBPT usada nas notas fiscais (Lei 12.741/2012).

![Tela do impostômetro](docs/impostometro.png)

> ⚠️ A tabela que vem no repositório é **ilustrativa**. Antes de produção, importe as tabelas oficiais (veja [Alíquotas](#alíquotas-ibpt)).

## Estrutura

```
packages/tax   cálculo puro (roda no servidor e no navegador) + tabela de alíquotas
apps/api       API REST — Fastify, PostgreSQL, Redis
apps/web       tela do impostômetro — React + Vite
apps/openfinance-mock   Banco Sandbox: Open Finance simulado que envia webhooks de compras
scripts/       importador das tabelas IBPT
```

## Instalar no celular

O OpenWallet é um **PWA**: instala direto do navegador, com ícone na tela inicial, abre em tela cheia e funciona sem internet (os dados atualizam quando a conexão volta). Para instalar, ele precisa estar publicado num endereço `https://`.

**1. Publicar de graça no Render (uma vez só):**
1. Crie uma conta em [render.com](https://render.com) entrando com o GitHub.
2. **New → Blueprint**, escolha o repositório `OpenWallet` e a branch onde está o `render.yaml`.
3. Clique em **Apply**. O Render cria o banco, o Redis e o app (API + worker + Banco Sandbox + tela) e devolve um endereço tipo `https://openwallet-xxxx.onrender.com`.

**2. Instalar:**
- **Android (Chrome):** abra o endereço → aparece o aviso **Instalar** no app (ou menu ⋮ → *Instalar app*).
- **iPhone (Safari):** abra o endereço → **Compartilhar** → **Adicionar à Tela de Início**.

> Plano gratuito: o servidor dorme após ~15 min sem uso (o primeiro acesso leva cerca de 1 min), o Banco Sandbox perde as conexões quando o servidor reinicia, e o Postgres gratuito expira em 30 dias. Para uso contínuo, troque os planos no `render.yaml`.
>
> Para publicar nas lojas depois: o mesmo PWA vira pacote da Play Store com o [PWABuilder](https://www.pwabuilder.com) (Trusted Web Activity), sem reescrever o app.

## Rodando

**Com Docker (tudo junto: 2 réplicas da API, 2 workers, banco simulado):**

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up --build
# app:            http://localhost:8080
# Banco Sandbox:  http://localhost:4000 (consentimentos e webhooks enviados)
```

**Desenvolvimento:**

```bash
npm install
cp apps/api/.env.example apps/api/.env   # ajuste DATABASE_URL / REDIS_URL
npm run build -w @openwallet/tax
npm run dev:api     # http://localhost:3000
npm run dev:worker  # processa webhooks e sincronizações
npm run dev:bank    # Banco Sandbox em http://localhost:4000
npm run dev:web     # http://localhost:5173 (encaminha /api para a API)
```

Para ligar o Open Finance no `.env` da API: `OPENFINANCE_BASE_URL=http://localhost:4000`, `OPENFINANCE_API_KEY=sandbox-key`, `OPENFINANCE_WEBHOOK_SECRET=sandbox-webhook-secret`.

**Testes** (precisam de Postgres em `localhost:5433` e Redis em `localhost:6380`, ou defina `TEST_DATABASE_URL` / `TEST_REDIS_URL`):

```bash
npm test
```

## Como o imposto é calculado

O imposto brasileiro é "por dentro": ele já está contido no preço. Então:

```
imposto = valor pago × (federal% + estadual%[UF] + municipal%) / 100
```

- Tudo em **centavos inteiros**. Cada parcela é arredondada e o total é a soma delas, então os números sempre batem.
- Cada gasto guarda uma **foto** do imposto e da versão da tabela usada (`rates_version`). Se a tabela mudar depois, o histórico não muda.
- A UF vem do perfil, mas pode ser trocada em cada gasto (compra feita em viagem).

## Open Finance

```
 App ──1. Conectar banco──▶ API ──cria consentimento──▶ Banco/agregador
  ◀──2. redireciona para a tela de consentimento do banco──┘
 usuário autoriza ──3. banco devolve para /openfinance/callback──▶ API confere state + status
                                                                   └─▶ agenda carga do histórico (90 dias)
 Banco ──4. webhook "transactions.created" (assinado HMAC)──▶ API: valida, deduplica, enfileira → 202
                                                    Worker ◀── fila no Postgres (SKIP LOCKED)
                                                      └─▶ busca transações paginadas → só compras →
                                                          categoria pelo MCC → imposto → INSERT em lote
```

- **Só compras viram gastos:** débitos do tipo compra. Pagamento de fatura, crédito e cashback são ignorados. Estorno apaga a compra original.
- **Categoria pelo MCC** do estabelecimento (`packages/tax/src/mcc.ts`). O usuário pode corrigir no app.
- **UF:** o Open Finance não informa o estado do estabelecimento, então usamos o do perfil.
- **Nada duplica:** o evento é deduplicado pelo `eventId` e o gasto pelo `transactionId` do banco. Gasto importado que o usuário apaga não volta (fica uma "lápide").
- **O webhook só valida e enfileira**, respondendo em milissegundos. Assinatura `x-ow-signature: t=<unix>,v1=<hmac-sha256>`, recusada se tiver mais de 5 min (contra repetição).
- **Worker separado e escalável:** acorda na hora por `LISTEN/NOTIFY`, tenta de novo com espera exponencial, marca como `dead` depois de 8 falhas e devolve à fila trabalhos de workers que morreram.

**Banco Sandbox (`apps/openfinance-mock`):** segue o formato do Open Finance Brasil (consentimento v3, cartões v2 com `payeeMCC`), tem tela de autorização e gera compras fictícias a cada `SIMULATE_INTERVAL_MS`. Também dá para forçar eventos:

```bash
curl -X POST localhost:4000/sandbox/purchase -H 'content-type: application/json' \
  -d '{"consentId":"urn:sandbox:...","amountCents":15000,"mcc":5541,"name":"POSTO TESTE"}'
curl -X POST localhost:4000/sandbox/reversal -H 'content-type: application/json' \
  -d '{"consentId":"urn:sandbox:...","transactionId":"..."}'
```

> O Open Finance Brasil oficial não envia webhooks de transação para quem recebe os dados; isso é feito por agregadores (Pluggy, Belvo...). O sandbox se comporta como um agregador. Para produção, implemente a interface `OpenFinanceProvider` (`apps/api/src/lib/openfinance-client.ts`) com o agregador escolhido e registre em `provider-factory.ts`. O restante (fila, worker, imposto) não muda.

## Alíquotas (IBPT)

1. Baixe as tabelas por UF no portal [De Olho no Imposto](https://deolhonoimposto.ibpt.org.br) (arquivos `TabelaIBPTaxSP26.2.A.csv` etc.) e coloque numa pasta, ex. `ibpt-raw/`.
2. Revise o mapeamento categoria → códigos NCM/LC 116 em `packages/tax/data/categories.json`.
3. Rode:

```bash
npm run import:ibpt -- ibpt-raw/
```

O script tira a média das alíquotas dos códigos de cada categoria, por estado, e grava `packages/tax/data/rates.json`.
A tabela do IBPT costuma ser atualizada a cada seis meses: repita o processo e faça o deploy.

## API

| Método | Rota | O que faz |
|---|---|---|
| POST | `/v1/auth/register` · `/login` · `/refresh` · `/logout` | Conta e sessão (access token de 15 min + refresh token rotativo) |
| GET/PATCH | `/v1/me` | Perfil (UF) |
| POST | `/v1/expenses` | Cria gasto já com imposto calculado. Aceita `Idempotency-Key` |
| GET | `/v1/expenses?limit&cursor&from&to&category` | Lista paginada por cursor |
| GET/PATCH/DELETE | `/v1/expenses/:id` | Detalhe, edição (recalcula imposto), exclusão |
| GET | `/v1/impostometro/summary?month=AAAA-MM` | Total do mês, por esfera e por categoria, e acumulado do ano |
| GET | `/v1/impostometro/history?months=12` | Imposto mês a mês |
| GET | `/v1/tax/rates` · `/categories` · `/estimate` | Tabela (com ETag), categorias e simulação |
| GET/POST | `/v1/openfinance/connections` | Lista conexões / inicia consentimento (devolve `authorizeUrl`) |
| POST | `/v1/openfinance/connections/callback` | Finaliza após o retorno do banco |
| POST/DELETE | `/v1/openfinance/connections/:id/sync` · `/:id` | Sincroniza agora / desconecta |
| POST | `/v1/webhooks/openfinance` | Webhook do provedor (assinado) |
| GET | `/health/live` · `/health/ready` | Liveness e readiness |

## Decisões para escalar e ficar estável

**API sem estado.** Nada fica na memória do processo: dá para rodar N réplicas atrás de um balanceador (o compose já sobe 2).

**Banco**
- `expenses` é **particionada por hash do usuário** (16 partições). Toda consulta filtra por `user_id`, então cada uma toca uma só partição, e os índices continuam pequenos com milhões de linhas.
- Índice `(user_id, spent_on DESC, id DESC)` atende a lista e o resumo.
- **Paginação por cursor** (keyset), não `OFFSET`: a página 1000 custa o mesmo que a primeira.
- `statement_timeout` e `idle_in_transaction_session_timeout` impedem que uma consulta travada segure conexões.
- Migrações com **advisory lock**: várias réplicas podem subir juntas sem conflito.
- Restrições no próprio banco (valor > 0, imposto = soma das parcelas, imposto ≤ valor).

**Redis (opcional e tolerante a falha)**
- Cache do resumo e do histórico, invalidado por versão a cada gravação do usuário.
- Rate limit compartilhado entre réplicas (300 req/min por usuário; 10/min nas rotas de login).
- Se o Redis cair, a API continua respondendo sem cache (testado), e o readiness mostra `degraded` sem tirar a réplica do ar.

**Robustez**
- `Idempotency-Key` no POST: reenvio por rede ruim ou clique duplo não duplica gasto (testado com requisições simultâneas).
- Refresh token **rotativo** com detecção de reuso: se um token antigo for usado de novo, todas as sessões do usuário caem.
- Senhas com scrypt; login com tempo constante mesmo para e-mail inexistente.
- Desligamento gracioso (SIGTERM): o readiness passa a falhar, as requisições em andamento terminam e só então banco e Redis fecham. Deploys sem 502.
- Validação de toda entrada com zod; limite de 16 KB por requisição; `x-request-id` em todos os logs e respostas.
- Logs estruturados em JSON, com o token removido.

**Cliente**
- A prévia do imposto no formulário é calculada no aparelho, com o mesmo pacote do servidor: resposta instantânea e zero carga extra.
- A tabela de alíquotas é servida com ETag e cache de 1 h.

**Números de referência** (1 instância, 1 vCPU, usuário com 20 mil gastos, 50 conexões simultâneas):

| Rota | Req/s | Latência p50 / p99 |
|---|---|---|
| `GET /impostometro/summary` (com cache) | ~5.100 | 7 ms / 38 ms |
| `GET /expenses?limit=30` | ~1.900 | 23 ms / 56 ms |
| `GET /tax/estimate` | ~11.500 | 3 ms / 12 ms |

### Próximos passos quando o volume crescer
- **PgBouncer** (modo transaction) na frente do Postgres quando o número de réplicas × `DB_POOL_MAX` passar de ~200 conexões.
- **Réplica de leitura** para resumo e histórico (aceitando alguns segundos de atraso).
- **Tabela de resumo mensal** (`user_id, month, category`) atualizada a cada gravação, se o resumo passar a pesar.
- **Métricas** (Prometheus/OpenTelemetry) e alertas de p99 e taxa de erro.
- Autoscaling horizontal da API pela CPU; a API já está pronta para isso.
