import { describe, expect, it } from 'vitest';
import tokens from '../../../../docs/design-system/tokens.json';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tokensParaCss, type TokensDS } from './tokens-css';

describe('tokens do design system', () => {
  it('tokens.css está em dia com docs/design-system/tokens.json (rode `npm run ds:tokens`)', () => {
    const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8');
    expect(css).toBe(tokensParaCss(tokens as TokensDS));
  });

  it('gera claro, escuro (sistema e forçado) e os aliases', () => {
    const saida = tokensParaCss(tokens as TokensDS);

    expect(saida).toContain('--primary: #2445e6;');
    expect(saida).toContain('--primary: #7b93ff;');
    expect(saida).toContain('--link: var(--primary);');
    expect(saida).toContain('--font-mono: "Geist Mono"');
    expect(saida).toContain("@media (prefers-color-scheme: dark)");
    expect(saida).toContain(":root[data-theme='dark']");
    expect(saida).toContain('--focus-ring: 0 0 0 2px #121311, 0 0 0 4px #7b93ff;');
  });
});
