import { createHmac, timingSafeEqual } from 'node:crypto';

/** Janela de validade de uma assinatura (contra ataque de repetição). */
export const SIGNATURE_TOLERANCE_S = 300;

/** Gera o cabeçalho "t=<unix>,v1=<hmac-sha256 de `${t}.${corpo}`>". */
export function signWebhook(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

/** Confere a assinatura do webhook em tempo constante e recusa assinaturas antigas ou do futuro. */
export function verifyWebhookSignature(
  secret: string,
  header: string | undefined,
  rawBody: string,
  nowSeconds = Date.now() / 1000,
): boolean {
  if (!secret || !header) return false;
  const parts = new Map<string, string>();
  for (const kv of header.split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) parts.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
  }
  const t = parts.get('t');
  const v1 = parts.get('v1');
  if (!t || !v1 || !/^\d+$/.test(t) || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  if (Math.abs(nowSeconds - Number(t)) > SIGNATURE_TOLERANCE_S) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  return timingSafeEqual(Buffer.from(v1, 'hex'), expected);
}
