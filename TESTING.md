# Testes no OpenWallet

## A pirâmide

```
        ▲  poucos, lentos     integration:*   API real + Postgres + Redis + Banco Sandbox
       ▲▲▲                                    (fluxos ponta a ponta: login, Open Finance, fila)
     ▲▲▲▲▲▲▲  muitos, rápidos  unit:*          funções e componentes isolados, sem rede/banco/disco
```

| Projeto | O que cobre | Onde ficam os testes | Precisa de |
|---|---|---|---|
| `unit:tax` | cálculo do imposto, tabela de alíquotas, MCC, IR/INSS, MEI/Simples, NFC-e, cashback, agenda, malha fina | `packages/tax/src/*.test.ts` | nada |
| `unit:api` | regras puras, config, senha, assinatura de webhook, cache, cliente HTTP do banco | `apps/api/src/**/*.test.ts` | nada |
| `unit:bank` | Banco Sandbox (consentimento, transações, webhooks) | `apps/openfinance-mock/src/*.test.ts` | nada |
| `unit:web` | formatação, cliente da API, formulário, login, instalação, componentes e tokens do design system, telas | `apps/web/src/**/*.test.{ts,tsx}` | nada (jsdom) |
| `integration:api` | rotas HTTP, SQL, fila, worker, Open Finance de ponta a ponta | `apps/api/test/integration/` | Postgres + Redis |

## Comandos

```bash
npm run test:unit          # só unitários (segundos)
npm run test:watch         # unitários em modo observação, enquanto você programa
npm run test:coverage      # unitários + cobertura (abre coverage/index.html)
npm run test:integration   # integração (precisa de Postgres e Redis, veja abaixo)
npm test                   # tudo
npx vitest run --project unit:web src/ExpenseForm    # um arquivo só
```

Banco para os testes de integração (o CI sobe sozinho):

```bash
docker run -d --name ow-pg -p 5433:5432 -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=openwallet_test postgres:16-alpine
docker run -d --name ow-redis -p 6380:6379 redis:7-alpine
# ou aponte para outro lugar: TEST_DATABASE_URL=... TEST_REDIS_URL=...
```

## Convenções

**Nome do teste diz o comportamento, em português**, como uma frase: `'nunca cobra mais imposto que o valor pago'`, não `'test calc 3'`. Quem lê o relatório de falha precisa entender o que quebrou sem abrir o código.

**Arrange, Act, Assert.** Prepare os dados, execute **uma** ação, verifique o resultado. Separe os três blocos com uma linha em branco quando o teste for maior que poucas linhas.

**Um comportamento por teste.** Vários `expect` são ok se descrevem o mesmo comportamento.

**Tabelas para variações** com `it.each`: um caso por linha, fácil de ler e de acrescentar.

**Propriedades para regras de dinheiro.** O cálculo do imposto usa [fast-check](https://fast-check.dev) para verificar regras que valem para *qualquer* entrada (total = soma das parcelas; imposto ≤ valor pago; gastar mais nunca gera menos imposto). Se uma propriedade falha, o fast-check mostra o menor exemplo que quebra.

**Testes unitários são isolados e determinísticos:**
- Sem rede: HTTP é simulado com [MSW](https://mswjs.io) (`onUnhandledRequest: 'error'` — chamada não prevista falha o teste).
- Sem relógio real: `vi.useFakeTimers()` / `vi.setSystemTime()` quando o resultado depende de data ou de espera.
- Sem banco: o que precisa de SQL vai para `integration:*`. Para viabilizar isso, regras de negócio ficam em módulos puros (ex.: `services/openfinance-rules.ts`) separados do código que acessa o banco.
- Mocks são restaurados automaticamente entre testes (`restoreMocks`, `unstubGlobals`).

**Dublês na fronteira, não no meio.** Simule o que é externo (HTTP, Redis, navegador), não as funções internas do próprio módulo. Prefira um fake simples em memória (veja `lib/cache.test.ts`) a encadear `mockReturnValue`.

**Componentes React testados como o usuário usa** ([Testing Library](https://testing-library.com)): encontre elementos por rótulo, papel e texto (`getByLabelText`, `getByRole`), interaja com `userEvent`, nunca por classe CSS ou estado interno.

**Builders de dados** (`test/factories.ts`): `aRatesTable()`, `aUser({ uf: 'MG' })`, `anExpense(...)`. Informe só o que importa para o caso; o resto vem com valores padrão válidos.

**Bug corrigido = teste novo** que falhava antes da correção.

## Cobertura

Medida só nos testes unitários, sobre o código com lógica testável isoladamente. O CI falha abaixo de:

| Escopo | Linhas | Funções | Branches |
|---|---|---|---|
| Geral | 80% | 80% | 75% |
| `packages/tax` (cálculo do imposto) | 95% | 95% | 90% |

Rotas, worker, fila e o serviço com SQL não entram nessa conta: são exercitados pelos testes de integração. Cobertura alta não é o objetivo; é um alarme para código importante sem teste.

## No CI

1. **Tipos + unitários** (sem serviços externos, ~1 min) com relatório de cobertura no resumo da execução e JUnit como artefato.
2. **Integração** em paralelo, com Postgres e Redis.
3. **Build** e **imagens Docker** só depois que os testes passam.
