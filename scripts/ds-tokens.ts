/**
 * Gera apps/web/src/ds/tokens.css a partir de docs/design-system/tokens.json.
 * O JSON é a fonte única: mude lá e rode `npm run ds:tokens`.
 * Um teste unitário (apps/web/src/ds/tokens.test.ts) falha se o CSS ficar desatualizado.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tokensParaCss, type TokensDS } from '../apps/web/src/ds/tokens-css.ts';

const raiz = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const tokens = JSON.parse(readFileSync(raiz('docs/design-system/tokens.json'), 'utf8')) as TokensDS;
writeFileSync(raiz('apps/web/src/ds/tokens.css'), tokensParaCss(tokens));
console.log('apps/web/src/ds/tokens.css atualizado');
