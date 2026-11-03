# Design system OpenWallet

> Fonte: o design system "OpenWallet" (artefato no Claude). Esta pasta é a cópia versionada dele no repositório e o que o app segue.
> Tokens em [`tokens.json`](tokens.json) · componentes em [`componentes/`](componentes) · código em [`apps/web/src/ds/`](../../apps/web/src/ds)

O OpenWallet existe para democratizar a educação financeira e tributária no Brasil. O público é todo mundo: quem ganha um salário mínimo, quem está endividado, quem é MEI, quem nunca declarou Imposto de Renda. O design tem que parecer **calmo, confiável e fácil**, nunca um painel de corretora.

## Voz e tom

Fale como uma pessoa que entende de dinheiro conversando com um amigo.

- **Trate por "você"** e use frases curtas. "Sobraram R$ 312 desde o salário."
- **Explique toda palavra técnica** na primeira vez que ela aparece. CDI, Selic, DAS, CBS, carnê-leão e malha fina nunca aparecem soltos: use o "O que é isso?" (veja [OQueE](componentes/OQueE.md)).
- **Prefira reais a porcentagens.** "Rendeu +R$ 19,87 este mês" antes de "+0,93%".
- **Sugira, não mande.** "Que tal guardar R$ 150?", e não "Guarde R$ 150". Toda sugestão diz de onde veio ("Por que essa sugestão?") e a tela lembra que a decisão é da pessoa.
- **Nunca prometa rendimento** nem indique um produto específico como "o melhor". Explique o tipo e o risco.
- **Sem culpa e sem medo.** "Tudo bem. A gente lembra você amanhã." Nada de urgência falsa, exclamações em série ou emoji.
- **Botões começam com verbo** e dizem o que acontece: "Pagar fatura", "Guardar recibo", "Comparar regimes". Desabilitado, o botão diz o que falta ("Escolha o vencimento").

### Como escrever valores e datas

| Caso | Escreva | Não escreva |
| --- | --- | --- |
| Moeda | R$ 1.284,50 | R$1284.50, BRL 1.284,50 |
| Entrada | +R$ 120,00 | R$ 120,00 (verde sem sinal) |
| Saída ou perda | −R$ 186,90 (sinal U+2212) | -R$ 186,90, (R$ 186,90) |
| Valor oculto | R$ •••• | ****, R$ 0,00 |
| Data recente | Hoje, 28 de outubro | 28/10/2026 em listas |
| Data em lista | Hoje · Ontem · 3 out · 21 jan 2027 | 03/10/2026 |
| Mês | Out 2026 | 10/2026 |

No código: `formatarReais()` e `<Money>` (valores), `dataLista()`, `dataExtenso()` e `mesAno()` em `apps/web/src/format.ts` (datas).

## Fundamentos visuais

- **Fundo de papel, cartões brancos.** As telas usam `surface`; tudo que é agrupado fica num cartão `surface-raised` com borda `line` e `radius-lg`. **Sem sombras**: a única sombra do sistema é `focus-ring`.
- **Uma cor de marca.** `primary` (azul) marca o que importa naquela tela: a aba ativa, a ação principal. No máximo uma ação `primary` por tela.
- **Ações dentro de cartões usam `ink`.** O botão escuro é a ação de um cartão ("Guardar recibo", "Emitir nota"). Assim o azul fica reservado para a ação da tela.
- **Números em fonte mono.** Todo valor em dinheiro usa `mono` (Geist Mono), com algarismos alinhados. Texto usa `sans` (Geist).
- **Cor com sentido.** `positive` para dinheiro que entra ou volta, `negative` para saída ou perda, `attention` para prazos e riscos. A cor **sempre** vem com o sinal (+ ou −) ou um rótulo. Em gráficos: `primary-strong` com `chart-2` (azul e laranja), nunca vermelho contra verde.
- **Explicação ao lado do dado.** Notas curtas em `surface-sunken` com `radius-sm` aparecem quando a pessoa toca em "O que é isso?" ou "Por que essa sugestão?".
- **Espaço.** Margem lateral `space-5` (20px), padding de cartão `space-4`, `space-3` entre ícone e texto. Telas de referência com 390px de largura.
- **Temas.** Claro e escuro, seguindo o sistema do aparelho (`prefers-color-scheme`). Para forçar: `<html data-theme="dark">`.

## Tokens

Fonte única: [`tokens.json`](tokens.json). O CSS do app é gerado a partir dele:

```bash
npm run ds:tokens   # gera apps/web/src/ds/tokens.css
```

Um teste unitário (`apps/web/src/ds/tokens.test.ts`) falha se alguém mudar o JSON e esquecer de gerar o CSS, ou editar o CSS à mão.

### Cores

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| `surface` | `#f3f2ee` | `#121311` | Fundo das telas. Papel levemente quente, nunca branco puro. |
| `surface-raised` | `#ffffff` | `#1c1d1a` | Cartões, listas e campos. |
| `surface-sunken` | `#eeece6` | `#262724` | Notas explicativas, trilho de barras, iniciais. |
| `line` | `#e4e2db` | `#2f302c` | Bordas de cartões e divisórias de lista. |
| `line-strong` | `#dad8d0` | `#4a4b46` | Borda de controles (botão secundário, chip, campo). |
| `ink` | `#121212` | `#f1f0ec` | Texto principal; fundo do botão `ink` e do chip selecionado. |
| `ink-soft` | `#3d3d3a` | `#c9c8c2` | Texto corrido secundário. |
| `ink-muted` | `#5e5e5a` | `#a3a29c` | Rótulos, datas, metadados (mínimo 12px). |
| `on-ink` | `#f3f2ee` | `#121311` | Texto sobre `ink`. |
| `primary` | `#2445e6` | `#7b93ff` | A cor da marca. Ação principal, aba ativa, metas. |
| `on-primary` | `#ffffff` | `#0b1033` | Texto e ícones sobre `primary`. |
| `primary-strong` | `#1a33b0` | `#a9b8ff` | Texto sobre `primary-soft`; 1ª série de gráficos. |
| `primary-soft` | `#eef0fd` | `#1a2150` | Fundo de tags e avisos informativos. |
| `link` | = `primary` | = `primary` | Links e ações de texto. |
| `positive` | `#17694a` | `#6fd3a0` | Dinheiro que entra, conclusão. Sempre com +. |
| `positive-soft` | `#e3f1ea` | `#10291e` | Fundo de confirmação ("Perfil salvo."). |
| `negative` | `#b23a0b` | `#ff9a66` | Saída e perda. Sempre com − (U+2212). |
| `attention` | `#8a4310` | `#f2b27a` | Prazo e risco ("Venceu", "Risco alto"). |
| `attention-soft` | `#fbebdd` | `#33190a` | Fundo de avisos de atenção. |
| `chart-2` | `#e08a3c` | `#e89a52` | 2ª série de gráficos, ao lado de `primary-strong`. |

### Tipografia

Duas famílias: **Geist** (interface e leitura) e **Geist Mono** (valores). O app serve as duas fontes junto com o próprio código (`@fontsource-variable/geist` e `@fontsource-variable/geist-mono`, licença OFL), registradas com os nomes dos tokens. Assim elas funcionam offline no PWA e não dependem do Google Fonts.

| Estilo | Tamanho / entrelinha | Peso | Uso |
| --- | --- | --- | --- |
| `title-xl` | 26 / 32 | 600 | Título de tela (h1) |
| `title-lg` | 22 / 28 | 600 | Manchete de cartão em destaque |
| `title-md` | 17 / 24 | 600 | Título de seção e de cartão (h2) |
| `title-sm` | 15 / 20 | 600 | Nome de item de lista (h3) |
| `body-lg` | 16 / 26 | 400 | Leitura longa |
| `body` | 15 / 22 | 400 | Texto padrão |
| `body-sm` | 14 / 21 | 400 | Descrições dentro de cartões |
| `caption` | 13 / 19 | 400 | Notas e linhas de apoio |
| `label` | 12 / 16 | 500 | Metadados, rótulos de campo e abas. Nunca menor. |
| `overline` | 12 / 16 | 600, caixa alta | Sobretítulo, no máximo um por cartão |
| `amount-xl` | 34 / 36 (mono) | 500 | Total principal do Início |
| `amount-lg` | 30 / 34 (mono) | 500 | Total de uma tela |
| `amount-md` | 15 / 20 (mono) | 500 | Valores em listas |
| `amount-sm` | 13 / 18 (mono) | 500 | Detalhes e valores no meio do texto |

No CSS do app, os estilos de texto são classes (`.title-md`, `.body-sm`, `.caption`, `.label`, `.overline`) e `h1`, `h2` e `h3` já vêm no tamanho certo.

### Espaço, raio e tamanho

| Token | Valor | Uso |
| --- | --- | --- |
| `space-1` | 4px | Título e linha de apoio |
| `space-2` | 8px | Chips e botões lado a lado |
| `space-3` | 12px | Ícone e texto; dentro de cartões |
| `space-4` | 16px | Padding de cartões e linhas |
| `space-5` | 20px | Margem lateral das telas e entre seções |
| `space-6` | 24px | Respiro maior entre blocos |
| `space-8` | 32px | Topo das telas |
| `radius-sm` | 12px | Notas explicativas, campos |
| `radius-md` | 16px | Opções, bolhas do assistente |
| `radius-lg` | 20px | Cartões e listas |
| `radius-xl` | 24px | Cartão em destaque |
| `radius-pill` | 999px | Botões, chips, tags, barras |
| `touch-min` | 44px | Área tocável mínima |
| `button-lg` | 52px | Botão principal grande |
| `focus-ring` | anel de 2px | Foco de teclado em qualquer controle |

## Iconografia

Ícones de traço desenhados à mão, em SVG inline: grade de 24px, traço de 1,8px, pontas e cantos arredondados, `fill="none"` e `stroke="currentColor"`. Tamanho 20–22px em botões e abas, 14–18px junto de texto. Botões só com ícone têm `aria-label`. **Sem emoji.** Bancos, lojas, clientes e contadores aparecem por **iniciais num círculo** `surface-sunken` ([Iniciais](componentes/Iniciais.md)), nunca com logos de terceiros.

No código: `<Icone nome="agenda" />` (`apps/web/src/ds/Icone.tsx`). O ícone do app (`apps/web/public/icons/`) segue a mesma linguagem: carteira em traço branco sobre `primary`.

## Acessibilidade

- Toda área tocável tem no mínimo `touch-min` (44px).
- Texto passa 4,5:1 nos dois temas, inclusive `ink-muted` em 12px.
- Seleções usam `aria-pressed` (chips), `role="switch"` (preferências e permissões) e `aria-current="page"` (aba ativa).
- Valores podem ser ocultados pelo **botão de olho** no topo de cada tela. A escolha fica salva no aparelho e vale para todo `<Money>`.
- Foco de teclado sempre visível (`focus-ring`); nada de `outline: none` sem substituto.

## Componentes

React 18+, em `apps/web/src/ds/componentes.tsx`, com as mesmas classes `ow-*` e a mesma API do pacote de referência. Estilos em `apps/web/src/ds/ds.css`.

| Componente | Para quê |
| --- | --- |
| [Button](componentes/Button.md) | Ações. `primary` uma por tela, `ink` dentro de cartões, `secondary` para a alternativa, `ghost` para ações de texto. |
| [Chip](componentes/Chip.md) | Escolhas rápidas: tipo de recibo, ano-base, atividade, "Paguei". |
| [Tag](componentes/Tag.md) | Rótulo curto de categoria ou risco (Prazo, Economia, Risco alto, Com CPF). |
| [Money](componentes/Money.md) | Qualquer valor em reais, com sinal, cor e opção de ocultar. |
| [ProgressBar](componentes/ProgressBar.md) | Meta ou limite (barra contínua) ou etapas (segmentos). |
| [Toggle](componentes/Toggle.md) | Liga e desliga preferências e permissões. |
| [SuggestionCard](componentes/SuggestionCard.md) | A sugestão do dia: categoria, título, convite, ação, "Agora não" e "Por que essa sugestão?". |
| [OQueE](componentes/OQueE.md) | Extensão do app: a nota "O que é isso?" que explica um termo ao lado do dado. |
| [Iniciais](componentes/Iniciais.md) | Extensão do app: iniciais num círculo, no lugar de logos. |

## Como o app aplica o design system

| Tela | O que segue o sistema |
| --- | --- |
| Início | Total do mês em `amount-xl` no cartão em destaque; divisão por esfera em `primary-strong`/`chart-2`/`ink-muted` com legenda; até 3 **sugestões do dia** (prazo da agenda, CPF na nota, perfil vazio) com o aviso "A decisão é sempre sua". |
| Notas | A única ação `primary` é "Ler QR code da nota"; status do CPF em tags; cashback perdido em `−R$` dentro de aviso de atenção. |
| IR | Simulador com saídas em `−R$`; restituição em `+R$`; ano-base em chips; riscos de malha como tags de atenção; "O que é isso?" para malha fina. |
| Agenda | Datas "19 nov", "Hoje"; chip "Paguei"/"Pago"; tag "Venceu"; "O que é isso?" para DAS e carnê-leão; .ics para levar à agenda do celular. |
| MEI | Limite com `ProgressBar` (`attention` acima de 70%); comparador com tag "Mais barato" e o lembrete de conversar com um contador. |
| Ajuda | Preferências do perfil com `Toggle`; sugestões de pergunta em chips; contadores por iniciais, com tag "Exemplo" nos cadastros fictícios. |

### Regras para quem for criar tela nova

1. Use só tokens (`var(--...)`): nada de cor, raio ou espaço solto.
2. Uma ação `primary` por tela; ações de cartão em `ink`.
3. Valor em dinheiro é sempre `<Money>`; cor só com sinal (`signed`).
4. Termo técnico ganha um `<OQueE>` na primeira aparição.
5. Escreva como convite, sem emoji, com o botão dizendo o que acontece.
6. Teste com a Testing Library pelo papel e pelo nome (`getByRole('switch', { name: 'Sou MEI' })`), nunca pela classe.
