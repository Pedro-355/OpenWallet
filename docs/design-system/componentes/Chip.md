# Chip

Chips são escolhas rápidas dentro de uma tela: tipo de recibo, ano-base, atividade do MEI, sugestões de pergunta, "Paguei".

- Um chip selecionado fica escuro (`ink`); os outros, brancos com borda `line-strong`.
- Para filtros, sempre inclua "Todos" como primeira opção.
- Numa linha que não cabe, os chips quebram linha (`.chips`).
- Quem usa controla `selected` e `onClick`. O componente já marca `aria-pressed`.

```tsx
<div className="chips" role="group" aria-label="Ano-base">
  <Chip selected={ano === 2025} onClick={() => setAno(2025)}>Ano-base 2025</Chip>
  <Chip selected={ano === 2026} onClick={() => setAno(2026)}>Ano-base 2026</Chip>
</div>
```
