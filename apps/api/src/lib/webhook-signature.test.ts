import { describe, expect, it } from 'vitest';
import { SIGNATURE_TOLERANCE_S, signWebhook, verifyWebhookSignature } from './webhook-signature.js';

const SECRET = 'segredo';
const BODY = '{"eventId":"1"}';
const NOW = 1_800_000_000;

describe('assinatura de webhook', () => {
  it('aceita assinatura válida dentro da janela', () => {
    const header = signWebhook(SECRET, BODY, NOW);
    expect(verifyWebhookSignature(SECRET, header, BODY, NOW)).toBe(true);
    expect(verifyWebhookSignature(SECRET, header, BODY, NOW + SIGNATURE_TOLERANCE_S)).toBe(true);
  });

  it('gera o formato t=<unix>,v1=<hex de 64>', () => {
    expect(signWebhook(SECRET, BODY, NOW)).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/);
  });

  it.each([
    ['segredo errado', () => signWebhook('outro', BODY, NOW), BODY, NOW],
    ['corpo alterado', () => signWebhook(SECRET, BODY, NOW), '{"eventId":"2"}', NOW],
    ['assinatura velha (repetição)', () => signWebhook(SECRET, BODY, NOW), BODY, NOW + SIGNATURE_TOLERANCE_S + 1],
    ['assinatura do futuro', () => signWebhook(SECRET, BODY, NOW + SIGNATURE_TOLERANCE_S + 1), BODY, NOW],
    ['sem cabeçalho', () => undefined, BODY, NOW],
    ['cabeçalho sem v1', () => `t=${NOW}`, BODY, NOW],
    ['v1 não hexadecimal', () => `t=${NOW},v1=${'z'.repeat(64)}`, BODY, NOW],
    ['v1 curto', () => `t=${NOW},v1=abcd`, BODY, NOW],
    ['t não numérico', () => signWebhook(SECRET, BODY, NOW).replace(/t=\d+/, 't=abc'), BODY, NOW],
  ])('recusa: %s', (_caso, header, body, now) => {
    expect(verifyWebhookSignature(SECRET, header() as string | undefined, body, now)).toBe(false);
  });

  it('recusa tudo quando o segredo não está configurado', () => {
    expect(verifyWebhookSignature('', signWebhook('', BODY, NOW), BODY, NOW)).toBe(false);
  });

  it('tolera espaços e ordem diferente dos campos', () => {
    const [t, v1] = signWebhook(SECRET, BODY, NOW).split(',');
    expect(verifyWebhookSignature(SECRET, ` ${v1}, ${t} `, BODY, NOW)).toBe(true);
  });
});
