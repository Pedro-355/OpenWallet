# Folha (bottom sheet)

Formulários e detalhes abrem numa folha que sobe de baixo, perto do polegar, sem a pessoa sair da tela em que estava. Código em `apps/web/src/ux/Folha.tsx`.

- **Título** diz o que a folha faz ("Novo gasto", "Nota nº 2"). A **descrição** opcional dá uma dica curta ("Os números estão no informe de rendimentos").
- Fecha pelo X, tocando fora, arrastando a alça para baixo mais de 96px, com Esc e com o **Voltar do Android**: cada folha aberta ocupa uma entrada no histórico.
- Foca o primeiro campo ao abrir, prende o foco dentro dela (Tab dá a volta) e devolve o foco para o botão que a abriu.
- Trava a rolagem da página de trás. No computador, aparece centralizada.
- Uma folha por vez. Para um passo de confirmação, troque o conteúdo dentro da mesma folha (veja "Cancelar nota" no MEI).

```tsx
const novo = useFolha();

<Button variant="primary" size="lg" block onClick={() => novo.abrir()}>Novo gasto</Button>
<Folha aberta={novo.aberta} onFechar={novo.fechar} titulo="Novo gasto" descricao="O imposto aparece enquanto você digita.">
  <ExpenseForm onSaved={() => { novo.fechar(); avisos.mostrar('Gasto adicionado.'); }} />
</Folha>
```

`useFolha<T>()` também guarda um dado (ex.: o item tocado): `detalhe.abrir(gasto)` e `detalhe.dado`.
