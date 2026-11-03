# Toggle

Toggle liga e desliga uma preferência ou permissão (no perfil: "Sou MEI", "Declaro Imposto de Renda").

- Fica à direita da linha, com o título e uma frase dizendo para que serve ("Para lembrar do carnê-leão todo mês").
- Permissões obrigatórias aparecem ligadas e desabilitadas, e a descrição começa com "Obrigatório".
- Quem usa controla `checked` e `onChange` e passa `label` com o nome da opção. O componente é um `role="switch"`.

```tsx
<div className="linha-toggle">
  <div>
    <span className="title-sm">Sou MEI</span>
    <span className="caption">Para acompanhar o limite, o DAS e emitir notas.</span>
  </div>
  <Toggle checked={p.mei} onChange={(v) => set('mei', v)} label="Sou MEI" />
</div>
```
