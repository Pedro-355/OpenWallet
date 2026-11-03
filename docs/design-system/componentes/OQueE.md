# OQueE ("O que é isso?")

Extensão do app sobre a regra "Explicação ao lado do dado". Um link `ow-link` abre uma nota `ow-note` (`surface-sunken`, `radius-sm`) logo abaixo, com a explicação em uma ou duas frases.

- Use na primeira vez que um termo técnico aparece numa tela: DAS, carnê-leão, CBS, cashback, malha fina, Open Finance.
- A explicação começa pelo que a coisa é, em palavras do dia a dia, e termina pelo que importa para a pessoa.
- O botão tem `aria-label` com o termo ("O que é isso? DAS") e `aria-expanded`.

```tsx
<OQueE termo="DAS">
  DAS é a guia mensal do MEI. O valor é fixo e já inclui o INSS e o ISS ou ICMS. Vence todo dia 20.
</OQueE>
```
