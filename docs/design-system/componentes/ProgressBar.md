# ProgressBar

ProgressBar mostra quanto falta para algo: uma meta ou um limite (barra contínua) ou etapas (segmentos).

- Barra contínua de 10px, sempre com os números ao lado ("R$ 58.000,00 de R$ 81.000,00").
- `segments` divide em etapas; cada etapa feita acende um segmento.
- `primary` é o padrão; `positive` só para algo concluído; `attention` quando o valor passa de um limite seguro (ex.: limite do MEI acima de 70%).
- `label` é obrigatório: é o que o leitor de tela anuncia.

```tsx
<ProgressBar value={p.limite.usadoPct} label="Uso do limite do MEI" tone={p.limite.nivel === 'ok' ? 'primary' : 'attention'} />
```
