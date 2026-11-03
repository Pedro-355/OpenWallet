import { describe, expect, it } from 'vitest';
import { amountToCents, daysAgo, isPurchase, isReversal, toSaoPauloDate } from './openfinance-rules.js';

describe('amountToCents', () => {
  it.each([
    ['0.01', 1],
    ['123.45', 12345],
    ['100.00', 10000],
    ['10.5000', 1050], // a especificação permite até 4 casas
    ['10.1249', 1012],
    ['10.1250', 1013], // meio centavo arredonda para cima
    ['999999999999999.99', 99999999999999999],
    [' 7.00 ', 700],
  ])('"%s" → %i centavos', (input, cents) => {
    expect(amountToCents(input)).toBe(cents);
  });

  it.each(['10', '10.5', '1,00', '-5.00', 'abc', '', '1.23456', '1e3.00'])('recusa formato fora do padrão: "%s"', (input) => {
    expect(() => amountToCents(input)).toThrow(/valor inválido/);
  });
});

describe('classificação de transações de cartão', () => {
  it.each([
    ['DEBITO', 'OUTROS', true, false],
    ['DEBITO', 'TARIFA', false, false],
    ['DEBITO', 'OPERACOES_CREDITO_CONTRATADAS_CARTAO', false, false],
    ['CREDITO', 'PAGAMENTO', false, false],
    ['CREDITO', 'CASHBACK', false, false],
    ['CREDITO', 'ESTORNO', false, true],
  ] as const)('%s/%s → compra=%s estorno=%s', (creditDebitType, transactionType, compra, estorno) => {
    const t = { creditDebitType, transactionType };
    expect(isPurchase(t)).toBe(compra);
    expect(isReversal(t)).toBe(estorno);
  });
});

describe('datas no horário de Brasília', () => {
  it('compra às 23h30 de Brasília (02h30 UTC do dia seguinte) é do dia local', () => {
    expect(toSaoPauloDate('2026-11-01T02:30:00.000Z')).toBe('2026-10-31');
  });

  it('daysAgo conta a partir do relógio informado', () => {
    const now = Date.parse('2026-11-03T12:00:00Z');
    expect(daysAgo(0, now)).toBe('2026-11-03');
    expect(daysAgo(3, now)).toBe('2026-10-31');
    expect(daysAgo(-1, now)).toBe('2026-11-04');
  });
});
