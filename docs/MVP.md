# OpenWallet — MVP

> Status: implementado na branch `CLAUDE/mvp-funcionalidades` (sobre `CLAUDE/impostometro`).
> Integrações com o governo rodam em **modo sandbox** (dados simulados e determinísticos) até termos credenciais e parceiros.
> Atualizado em 03/11/2026.

## 1. Problema e proposta

O brasileiro paga muito imposto sem enxergar quanto, perde dinheiro por falta de informação (restituição, cashback, descontos de IPVA/IPTU) e tem medo de errar com o Leão (malha fina, MEI desenquadrado, carnê-leão esquecido).

**Proposta:** um app gratuito que mostra quanto imposto a pessoa paga de verdade, devolve o dinheiro que é dela e evita multas, com uma camada paga para IR e MEI e um marketplace de contadores para os casos complexos.

**Por que agora:** 2026–2027 concentram as maiores mudanças em décadas:

- **Lei 15.270/2025:** IR zerado até R$ 5 mil por mês e redutor até R$ 7.350. Muita gente não sabe se ainda precisa declarar.
- **Reforma do consumo (EC 132/2023 e LC 214/2025):** a CBS passa a valer em 2027 e o cashback da CBS começa a ser pago em jan/2027. Para isso, a pessoa precisa pôr o **CPF na nota**.

## 2. Público

| Segmento | Dor principal | Funcionalidades-chave |
|---|---|---|
| CLT de baixa e média renda | "Quanto pago de imposto? Vou ter restituição?" | Impostômetro, simulador de IR, prévia da declaração |
| Famílias do CadÚnico (~28 mi) | Não perder o cashback | Leitor de NFC-e, cashback, CPF na nota |
| MEI (~15 mi) | Estourar o limite, esquecer o DAS, emitir nota | Painel do MEI, agenda, NFS-e, comparador de regimes |
| Autônomo/aluguel | Carnê-leão e malha | Agenda, rendimentos, checagem de malha |

## 3. O que foi construído

Cada item lista onde está o código: **regra** = cálculo puro em `packages/tax/src/fiscal/` (roda no servidor e no navegador); **API** = rotas em `apps/api/src/routes/`; **tela** = `apps/web/src/telas/`.

### 3.1 Impostômetro (já existia) + impostômetro anual
- Imposto embutido em cada gasto, por esfera e UF (Lei 12.741/2012).
- **Novo:** "Seu ano em impostos": consumo + IR + INSS + IPVA/IPTU + DAS, traduzido em **dias de trabalho** ("até 06/03 você trabalhou só para pagar impostos"). Sem rendimentos lançados, estima IR/INSS pela renda do perfil (CLT).
- Regra: `anual.ts` · API: `GET /v1/impostometro/anual` · Tela: `AnualCard.tsx` (aba Início)

### 3.2 Leitor de nota fiscal (NFC-e)
- Câmera (BarcodeDetector) ou colar/digitar o link do QR code ou a chave de 44 dígitos.
- Valida a chave (UF, modelo 55/65, dígito módulo 11), extrai valor e dia do QR offline (v2) e CPF do QR v1.
- Consulta a nota (sandbox), separa os itens por categoria e cria um gasto por categoria, com o imposto da **UF da nota**. Ler a mesma nota de novo devolve 409.
- Regra: `nfce.ts` · API: `POST /v1/notas/ler`, `GET /v1/notas` · Tela: `Notas.tsx`

### 3.3 Cashback da reforma tributária
- Elegibilidade (LC 214/2025, art. 113): CadÚnico + renda per capita ≤ ½ salário mínimo (R$ 810,50 em 2026).
- Estimativa (art. 118): 100% da CBS e 20% do IBS em contas da casa; 20% + 20% no resto. CBS a partir de 2027 e IBS a partir de 2029 (art. 123). Mostra **quanto se perde por compras sem CPF na nota**.
- Alíquotas de CBS (8,8%) e IBS (17,7%) são **estimativas** até a resolução do Senado. A fração tributada de mercado e saúde também é estimada (cesta básica com alíquota zero).
- Regra: `cashback.ts` · API: `GET /v1/cashback` · Tela: `Notas.tsx`

### 3.4 Imposto de Renda
- **Simulador mensal** (holerite/carnê-leão) com INSS progressivo 2026, desconto simplificado e redutor da Lei 15.270.
- **Prévia da declaração** do ano: rendimentos + pasta de recibos + carnê-leão pago → completa × simplificada, restituição/imposto a pagar e redutor anual (até R$ 60 mil isento; redução até R$ 88,2 mil).
- **Pasta de recibos** (saúde, educação por pessoa, PGBL, pensão) e **rendimentos** (CRUD).
- **Checagem de malha fina:** despesa médica sem CPF/CNPJ, saúde > 20% da renda, recibo duplicado, salário sem CNPJ da fonte, carnê-leão em aberto, dependente duplicado, educação sem CNPJ.
- Regras: `irpf.ts`, `malha.ts`, `params.ts` · API: `/v1/ir/*`, `/v1/rendimentos` · Tela: `Ir.tsx`

### 3.5 Agenda fiscal
- Vencimentos automáticos pelo perfil: **DAS** (dia 20; em feriado ou fim de semana, mostra o dia útil anterior, para nunca atrasar), **carnê-leão** (último dia útil do mês seguinte), **DASN-SIMEI** (31/05) e **DIRPF** (último dia útil de maio, marcada como "prevista").
- Calendário de dias úteis com feriados nacionais e móveis (Carnaval, Sexta-feira Santa, Corpus Christi, Consciência Negra).
- Compromissos avulsos (IPVA, IPTU), marcar como pago e exportar para a agenda do celular (.ics com lembrete 2 dias antes).
- **À vista ou parcelado?** Calcula os juros embutidos no parcelamento e compara com o rendimento do dinheiro.
- **Dinheiro a receber** (restituição, nota fiscal estadual, valores a receber do Banco Central, cashback) e **pendências com o Fisco** (sandbox, com links oficiais).
- Regra: `agenda.ts` · API: `/v1/agenda*`, `/v1/creditos`, `/v1/pendencias` · Tela: `Agenda.tsx`

### 3.6 MEI
- Painel: faturamento do ano (notas emitidas + recebimentos), limite de R$ 81 mil (proporcional no ano de abertura), alertas em 70%, 90%, excesso até 20% e desenquadramento, quanto ainda cabe por mês e DAS 2026 (R$ 82,05/86,05/87,05).
- **Emissão de NFS-e** (sandbox) com numeração sequencial por usuário, à prova de concorrência, e cancelamento.
- **Comparador de regimes:** MEI × Simples Anexo III (fator R) × Anexo V × Anexo I × autônomo PF (INSS 20% + IR).
- Regra: `mei.ts` · API: `/v1/mei/*` · Tela: `Mei.tsx`

### 3.7 Assistente tributário
- Base com 23 artigos do CTN (texto de lei) e 14 guias em linguagem simples (`apps/api/data/assistente.json`).
- Busca BM25 sem dependências. Com `ASSISTENTE_API_KEY`, um modelo de linguagem redige a resposta **só com os trechos encontrados**, citando o id. Sem chave, ou se o modelo falhar, responde com o trecho mais relevante. Limite de 20 perguntas por minuto.
- API: `POST /v1/assistente` · Tela: `Ajuda.tsx`

### 3.8 Marketplace de contadores
- Diretório por UF e especialidade e pedido de contato (lead). Cadastros de exemplo **fictícios**, marcados com o selo "Exemplo", aparecem só fora de produção (`MOSTRAR_EXEMPLOS`).
- API: `/v1/contadores*` · Tela: `Ajuda.tsx`

### 3.9 Perfil fiscal
- Tipo de renda, renda mensal, dependentes, família/CadÚnico, MEI (atividade e abertura), carnê-leão e se declara IR. Personaliza agenda, IR, MEI, cashback e o impostômetro anual.
- API: `GET/PUT /v1/perfil-fiscal` · Tela: `Ajuda.tsx`

## 4. Parâmetros oficiais (2026)

Todos em `packages/tax/src/fiscal/params.ts`, com a fonte ao lado de cada valor.

| Item | Valor |
|---|---|
| Salário mínimo | R$ 1.621,00 |
| INSS empregado | 7,5% / 9% / 12% / 14% até o teto de R$ 8.475,55 |
| IR mensal | isento até R$ 2.428,80; 27,5% acima de R$ 4.664,68 (parcela a deduzir R$ 908,73) |
| Redutor mensal (Lei 15.270) | até R$ 312,89 (renda ≤ R$ 5 mil); R$ 978,62 − 0,133145 × renda (até R$ 7.350) |
| Redutor anual | até R$ 2.694,15 (≤ R$ 60 mil); R$ 8.429,73 − 0,095575 × renda (até R$ 88,2 mil) |
| Deduções anuais | dependente R$ 2.275,08; educação R$ 3.561,50 por pessoa; simplificado 20% até R$ 17.640 |
| MEI | limite R$ 81 mil; DAS = 5% do SM + R$ 1 (ICMS) / R$ 5 (ISS) |
| Cashback | renda per capita ≤ R$ 810,50; 100% CBS + 20% IBS (essenciais); 20% + 20% (demais) |

**A confirmar:** limite de obrigatoriedade da declaração de 2027 (usamos o de 2026, R$ 35.584, e o app avisa); alíquotas de referência da CBS e do IBS; regra de vencimento do DAS em feriado (as fontes divergem; usamos a opção conservadora). A tabela anual foi derivada da mensal × 12.

## 5. Arquitetura

```
packages/tax/src/fiscal   regras puras (IR, INSS, MEI, Simples, NFC-e, cashback, agenda, malha, anual)
apps/api                  Fastify + PostgreSQL + Redis
  migrations/003_mvp.sql  perfil, notas lidas, recibos, rendimentos, agenda, créditos, NFS-e, contadores
  src/routes/             perfil, notas, ir, agenda, mei, extras (cashback, anual, créditos, pendências, assistente, contadores)
  src/lib/gov-providers   interfaces + sandbox: NotaFiscalProvider, NfseProvider, PendenciasProvider
  src/lib/assistente-llm  cliente do modelo (opcional)
  data/assistente.json    base do assistente
apps/web/src/telas        Notas, Ir, Agenda, Mei, Ajuda, AnualCard, Navegacao (abas no rodapé)
```

**Configuração nova** (`apps/api/src/config.ts`): `NOTAS_PROVIDER`, `NFSE_PROVIDER`, `PENDENCIAS_PROVIDER` (hoje só `sandbox`), `ASSISTENTE_API_KEY`, `ASSISTENTE_MODEL`, `ASSISTENTE_BASE_URL`, `ASSISTENTE_TIMEOUT_MS` e `MOSTRAR_EXEMPLOS`.

## 6. Qualidade

- **447 testes** passando: 392 unitários e 55 de integração (eram 210 + 29).
- Cobertura dos unitários: 93% das linhas. O pacote de cálculo, que exige 95%, ficou em 100% das linhas.
- Testes de propriedade (fast-check) nas regras de dinheiro: o IR nunca é negativo nem maior que a renda; o INSS nunca diminui quando o salário sobe; o cashback nunca passa do gasto.
- Telas conferidas no navegador num celular emulado (Pixel 7), sem erros no console.

## 7. Para ir a produção

| Integração | Caminho | Esforço |
|---|---|---|
| Alíquotas IBPT oficiais | `npm run import:ibpt` com as tabelas do portal De Olho no Imposto | baixo |
| Consulta de NFC-e | Não há API pública única: agregador de consulta de NF-e/NFC-e ou portais das SEFAZ (implementar `NotaFiscalProvider`) | médio |
| NFS-e do MEI | API do Emissor Nacional (ADN) com certificado digital A1 do MEI (implementar `NfseProvider`) | médio/alto |
| Dívida ativa / e-CAC | Exigem login gov.br do cidadão: procuração eletrônica ou parceiro autorizado (`PendenciasProvider`) | alto |
| Open Finance | Agregador (Pluggy, Belvo...) na interface `OpenFinanceProvider` já existente | médio |
| Assistente | Configurar `ASSISTENTE_API_KEY`; ampliar a base (IN da Receita, LC 123, LC 214) | baixo |
| LGPD | Base legal, consentimento, criptografia de dados sensíveis (CPF de terceiros nos recibos), retenção e exclusão | médio |
| Contadores reais | Cadastro com verificação do CRC, painel do contador e cobrança | médio |

## 8. Modelo de negócio (proposta)

- **Grátis:** impostômetro, leitor de notas, cashback, agenda básica e assistente com busca.
- **Premium (assinatura):** prévia completa da declaração e checagem de malha, pasta de recibos ilimitada, assistente com modelo de linguagem, painel do MEI com emissão de NFS-e e lembretes por push.
- **Marketplace:** comissão por consulta ou serviço fechado com contadores (declaração, regularização do MEI, malha fina).
- **B2B2C:** bancos, fintechs e varejo oferecendo o "CPF na nota + cashback" e o impostômetro como funcionalidade de engajamento.

No MVP tudo fica aberto (beta). O controle de plano ainda não foi implementado.

## 9. Métricas do piloto

- Ativação: perfil preenchido e primeira nota lida em até 7 dias.
- Engajamento: notas lidas por usuário por mês e percentual de notas **com CPF**.
- Valor entregue: R$ em cashback estimado, restituição prevista e economia "à vista × parcelado".
- Conversão: pedidos de contato com contadores e interesse no premium.
- Qualidade: taxa de "não encontrei" do assistente e alertas de malha resolvidos antes do envio.

## 10. Próximos passos

1. Importar as tabelas oficiais do IBPT e trocar o sandbox de NFC-e por um provedor real em um estado piloto (SP).
2. Notificações push (PWA) para os vencimentos da agenda.
3. Importar o informe de rendimentos (PDF) e a declaração pré-preenchida para alimentar a prévia do IR.
4. Planos e cobrança (premium) e painel do contador.
5. Revisão jurídica e de LGPD antes do lançamento público.
