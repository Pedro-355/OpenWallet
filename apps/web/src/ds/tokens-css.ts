/** Converte o tokens.json do design system em variáveis CSS (tema claro padrão, escuro pelo sistema ou por data-theme). */

type Valor = string | { light: string; dark: string };
interface Token {
  name: string;
  value: Valor;
}
export interface TokensDS {
  color: { tokens: Token[] };
  type: { families: Record<string, string> };
  spacing: { tokens: Token[] };
  radius: { tokens: Token[] };
  shadow: { tokens: Token[] };
  size: { tokens: Token[] };
}

const ref = (v: string) => v.replace(/^\{([\w-]+)\}$/, 'var(--$1)');

function linhas(tokens: Token[], tema: 'light' | 'dark' | 'fixo'): string[] {
  return tokens.flatMap((t) => {
    if (typeof t.value === 'string') return tema === 'fixo' ? [`  --${t.name}: ${ref(t.value)};`] : [];
    return tema === 'fixo' ? [] : [`  --${t.name}: ${t.value[tema]};`];
  });
}

export function tokensParaCss(t: TokensDS): string {
  const temaveis = [...t.color.tokens, ...t.shadow.tokens];
  const fixos = [
    ...t.color.tokens,
    ...Object.entries(t.type.families).map(([k, v]) => ({ name: `font-${k}`, value: v })),
    ...t.spacing.tokens,
    ...t.radius.tokens,
    ...t.size.tokens,
  ];
  const escuro = linhas(temaveis, 'dark').map((l) => `  ${l}`);
  return [
    '/* Gerado por `npm run ds:tokens` a partir de docs/design-system/tokens.json. Não edite à mão. */',
    ':root {',
    '  color-scheme: light;',
    ...linhas(temaveis, 'light'),
    ...linhas(fixos, 'fixo'),
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    "  :root:not([data-theme='light']) {",
    '    color-scheme: dark;',
    ...escuro,
    '  }',
    '}',
    '',
    ":root[data-theme='dark'] {",
    '  color-scheme: dark;',
    ...linhas(temaveis, 'dark'),
    '}',
    '',
  ].join('\n');
}
