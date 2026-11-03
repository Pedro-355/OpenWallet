import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tokensParaCss, type TokensDS } from './tokens-css';

// Lido do disco (e não importado) para o build da imagem Docker, que não copia docs/, continuar compilando.
const tokens = JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/design-system/tokens.json'), 'utf8')) as TokensDS;

describe('tokens do design system', () => {
  it('tokens.css está em dia com docs/design-system/tokens.json (rode `npm run ds:tokens`)', () => {
    const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8');
    expect(css).toBe(tokensParaCss(tokens));
  });

  it('gera claro, escuro (sistema e forçado) e os aliases', () => {
    const saida = tokensParaCss(tokens);

    expect(saida).toContain('--primary: #2445e6;');
    expect(saida).toContain('--primary: #7b93ff;');
    expect(saida).toContain('--link: var(--primary);');
    expect(saida).toContain('--font-mono: "Geist Mono"');
    expect(saida).toContain("@media (prefers-color-scheme: dark)");
    expect(saida).toContain(":root[data-theme='dark']");
    expect(saida).toContain('--focus-ring: 0 0 0 2px #121311, 0 0 0 4px #7b93ff;');
  });
});
