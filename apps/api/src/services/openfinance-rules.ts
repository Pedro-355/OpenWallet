/**
 * Regras puras da importação Open Finance (sem banco, sem rede): fáceis de testar e de auditar.
 */
import type { CardTransaction } from '../lib/openfinance-client.js';

/**
 * Converte o valor do Open Finance ("123.45", "10.5000") em centavos, sem passar por float.
 * A especificação aceita de 2 a 4 casas decimais; arredondamos meio-centavo para cima.
 */
export function amountToCents(amount: string): number {
  const m = /^(\d{1,15})\.(\d{2,4})$/.exec(amount.trim());
  if (!m) throw new Error(`valor inválido do provedor: "${amount}"`);
  const [, int, dec] = m as unknown as [string, string, string];
  const cents = Number(int) * 100 + Number(dec.slice(0, 2));
  const rest = dec.slice(2);
  return rest && Number(rest[0]) >= 5 ? cents + 1 : cents;
}

/** Compra no cartão = débito do tipo OUTROS. Pagamento de fatura, tarifa, cashback e crédito não são consumo. */
export const isPurchase = (t: Pick<CardTransaction, 'creditDebitType' | 'transactionType'>) =>
  t.creditDebitType === 'DEBITO' && t.transactionType === 'OUTROS';

export const isReversal = (t: Pick<CardTransaction, 'creditDebitType' | 'transactionType'>) =>
  t.creditDebitType === 'CREDITO' && t.transactionType === 'ESTORNO';

/** Data (AAAA-MM-DD) no horário de Brasília de um instante ISO — a compra das 23h do dia 31 é do dia 31. */
export const toSaoPauloDate = (iso: string | Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

/** Data de N dias atrás (negativo = no futuro), no horário de Brasília. */
export const daysAgo = (n: number, now = Date.now()) => toSaoPauloDate(new Date(now - n * 86_400_000));
