# Button

Botões começam com verbo e dizem exatamente o que acontece: "Pagar fatura", "Guardar recibo", "Comparar regimes".

- **primary** (azul): a ação da tela. No máximo uma por tela. Em destaque, use `size="lg"` e `block`.
- **ink** (escuro): a ação de um cartão. Mantém o azul livre para a ação da tela.
- **secondary**: a alternativa ao lado de uma ação ("Agora não", "Recebi").
- **ghost**: ação de texto, como "Levar para minha agenda" ou "Cancelar nota".
- Desabilitado só enquanto falta algo para continuar; nesse caso, o texto explica o que falta ("Escolha o vencimento").

Altura mínima 44px (`touch-min`), 52px no tamanho `lg`.

```tsx
import { Button } from '../ds/componentes';

<Button variant="ink" type="submit">Guardar recibo</Button>
<Button variant="primary" size="lg" block>Ler QR code da nota</Button>
```

| Prop | Tipo | Padrão |
| --- | --- | --- |
| `variant` | `'primary' \| 'ink' \| 'secondary' \| 'ghost'` | `'primary'` |
| `size` | `'md' \| 'lg'` | `'md'` |
| `block` | `boolean` | `false` |
| demais | atributos de `<button>` (`type` padrão `button`) | |
