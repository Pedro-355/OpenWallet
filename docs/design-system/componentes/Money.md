# Money

Money mostra qualquer valor em reais no formato brasileiro (R$ 1.284,50), em Geist Mono com algarismos alinhados.

- `xl` para o total do Início, `lg` para o total de uma tela, `md` em listas, `sm` para detalhes e valores no meio do texto.
- Use `signed` em entradas, saídas, restituições e perdas: o componente coloca + ou − (U+2212) e a cor certa. **A cor nunca aparece sem o sinal.**
- Saldos e totais ficam neutros (sem `signed`), mesmo quando altos. Para mostrar o sinal sem cor (ex.: gasto na lista), use `signed tone="neutral"`.
- `hidden` troca o valor por R$ ••••. Sem a prop, o componente segue o **botão de olho** do app.
- `value` em reais (API original) ou `cents` em centavos (atalho do app, que trabalha em centavos).
- `compact` tira os centavos, para rótulos curtos de gráfico ("R$ 184").

```tsx
<Money cents={melhor.saldoCents} size="lg" signed />   // +R$ 2.333,18 em verde
<Money cents={-r.impostoCents} signed />                 // −R$ 569,92 em laranja-escuro
<Money cents={total} size="xl" />                        // R$ 208,90 neutro
```

Para texto fora de componente (ex.: arquivo .ics), use `formatarReais(valorEmReais, signed)`.
