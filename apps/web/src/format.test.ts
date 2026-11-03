import { describe, expect, it, vi } from 'vitest';
import { brl, capitalize, dayLabel, lastDay, monthLong, monthShort, parseMoney, parseReais, pct, shiftMonth, todayISO } from './format';

const nbsp = (s: string) => s.replace(/\s/g, ' ');

describe('parseMoney', () => {
  it.each([
    ['12,34', 1234],
    ['12.34', 1234],
    ['1.234,56', 123456],
    ['1234', 123400],
    ['R$ 99,90', 9990],
    ['0,01', 1],
    ['  7 ', 700],
    ['0,005', 1], // arredonda meio centavo para cima
  ])('"%s" → %i centavos', (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });

  it.each(['', '   ', 'abc', '0', '0,00', '-5', '1,2,3'])('"%s" não é um valor válido', (input) => {
    expect(parseMoney(input)).toBeNull();
  });
});

describe('meses', () => {
  it.each([
    ['2026-10', 1, '2026-11'],
    ['2026-12', 1, '2027-01'],
    ['2026-01', -1, '2025-12'],
    ['2026-03', -14, '2025-01'],
  ])('shiftMonth(%s, %i) = %s', (ym, delta, expected) => {
    expect(shiftMonth(ym, delta)).toBe(expected);
  });

  it.each([
    ['2026-02', '2026-02-28'],
    ['2028-02', '2028-02-29'], // ano bissexto
    ['2026-04', '2026-04-30'],
    ['2026-12', '2026-12-31'],
  ])('lastDay(%s) = %s', (ym, expected) => {
    expect(lastDay(ym)).toBe(expected);
  });

  it('nomes em português', () => {
    expect(monthLong('2026-03')).toBe('março de 2026');
    expect(capitalize(monthLong('2026-03'))).toBe('Março de 2026');
    expect(monthShort('2026-12')).toBe('dez');
    expect(dayLabel('2026-10-05')).toBe('05/10');
  });
});

describe('todayISO', () => {
  it('usa o dia de Brasília, não o UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T02:00:00Z')); // 23h do dia 31 em Brasília
    expect(todayISO()).toBe('2026-10-31');
    vi.useRealTimers();
  });
});

describe('formatação', () => {
  it('moeda e porcentagem no padrão brasileiro', () => {
    expect(nbsp(brl(123456))).toBe('R$ 1.234,56');
    expect(nbsp(brl(0))).toBe('R$ 0,00');
    expect(pct(31.45)).toBe('31,5%');
    expect(pct(18)).toBe('18%');
  });
});

describe('parseReais', () => {
  it.each([
    ['90.000', 9_000_000],
    ['1.234.567', 123_456_700],
    ['R$ 2.600', 260_000],
    ['12,34', 1_234],
    ['12.34', 1_234],
    ['1.234,56', 123_456],
    ['', null],
  ])('"%s" → %s', (entrada, esperado) => {
    expect(parseReais(entrada)).toBe(esperado);
  });
});
