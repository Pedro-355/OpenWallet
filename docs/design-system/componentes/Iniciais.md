# Iniciais

Extensão do app sobre a regra "Bancos aparecem por iniciais num círculo `surface-sunken`, nunca com logos de terceiros". Vale também para lojas das notas fiscais, fontes pagadoras, clientes do MEI e contadores.

- Duas letras: primeira letra das duas primeiras palavras relevantes ("Caixa Econômica Federal" → CE); uma palavra só usa as duas primeiras letras ("Nubank" → NU).
- Texto entre parênteses é ignorado ("Escritório Exemplo (fictício)" → EE).
- É decorativo (`aria-hidden`): o nome sempre aparece em texto ao lado.

```tsx
<Iniciais nome={n.emitenteNome} />
```
