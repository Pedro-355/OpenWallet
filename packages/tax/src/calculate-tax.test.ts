import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { UFS, calculateTax, resolveRates, type UF } from './index.js';
import { aRatesTable } from '../test/factories.js';

describe('calculateTax', () => {
  const table = aRatesTable();

  describe('exemplos conhecidos', () => {
    it('R$ 100 com 13,45% federal + 18% ICMS-SP resulta em R$ 31,45', () => {
      const result = calculateTax(table, { amountCents: 10_000, category: 'mercado', uf: 'SP' });

      expect(result).toMatchObject({
        federalCents: 1345,
        estadualCents: 1800,
        municipalCents: 0,
        totalCents: 3145,
        ratePct: 31.45,
        ratesVersion: 'teste-1',
      });
    });

    it('usa o ICMS da UF informada', () => {
      expect(calculateTax(table, { amountCents: 10_000, category: 'mercado', uf: 'RJ' }).estadualCents).toBe(2000);
    });

    it('usa estadualPadrao quando a UF não tem alíquota própria', () => {
      expect(calculateTax(table, { amountCents: 10_000, category: 'mercado', uf: 'BA' }).estadualCents).toBe(1700);
    });

    it('soma ISS municipal em serviços', () => {
      const result = calculateTax(table, { amountCents: 5_000, category: 'servicos', uf: 'SP' });
      expect(result).toMatchObject({ federalCents: 500, estadualCents: 0, municipalCents: 250, totalCents: 750 });
    });

    it('categoria desconhecida cai na categoria padrão', () => {
      const result = calculateTax(table, { amountCents: 1_000, category: 'inexistente', uf: 'SP' });
      expect(result.category).toBe('outros');
      expect(result.totalCents).toBe(200);
    });

    it('valor zero resulta em imposto zero', () => {
      expect(calculateTax(table, { amountCents: 0, category: 'mercado', uf: 'SP' }).totalCents).toBe(0);
    });
  });

  describe('entradas inválidas', () => {
    it.each([
      ['negativo', -1],
      ['fracionado', 1.5],
      ['NaN', Number.NaN],
      ['acima do inteiro seguro', Number.MAX_SAFE_INTEGER + 1],
    ])('rejeita valor %s', (_nome, amountCents) => {
      expect(() => calculateTax(table, { amountCents, category: 'mercado', uf: 'SP' })).toThrow(RangeError);
    });

    it('falha de forma clara se a tabela não tiver a categoria padrão', () => {
      const broken = { ...table, fallbackCategory: 'sumiu' };
      expect(() => resolveRates(broken, 'x', 'SP')).toThrow(/categoria padrão "sumiu"/);
    });
  });

  describe('limite de segurança', () => {
    it('nunca cobra mais imposto que o valor pago, mesmo com alíquotas somando mais de 100%', () => {
      const absurda = aRatesTable({
        categories: { absurda: { label: 'x', federal: 70, estadual: {}, estadualPadrao: 60, municipal: 10 } },
      });
      const result = calculateTax(absurda, { amountCents: 999, category: 'absurda', uf: 'SP' });

      expect(result.totalCents).toBeLessThanOrEqual(999);
      expect(result.totalCents).toBe(result.federalCents + result.estadualCents + result.municipalCents);
      expect(result.ratePct).toBe(100);
    });
  });

  // Propriedades que valem para QUALQUER valor, categoria e UF (testes baseados em propriedades).
  describe('propriedades', () => {
    const anyAmount = fc.integer({ min: 0, max: 100_000_000_00 });
    const anyUf = fc.constantFrom(...UFS) as fc.Arbitrary<UF>;
    const anyCategory = fc.constantFrom('mercado', 'servicos', 'outros', 'nao-existe');

    it('o total é sempre a soma exata das parcelas', () => {
      fc.assert(
        fc.property(anyAmount, anyCategory, anyUf, (amountCents, category, uf) => {
          const r = calculateTax(table, { amountCents, category, uf });
          return r.totalCents === r.federalCents + r.estadualCents + r.municipalCents;
        }),
      );
    });

    it('o imposto fica entre zero e o valor pago, sempre em centavos inteiros', () => {
      fc.assert(
        fc.property(anyAmount, anyCategory, anyUf, (amountCents, category, uf) => {
          const r = calculateTax(table, { amountCents, category, uf });
          return [r.federalCents, r.estadualCents, r.municipalCents].every(Number.isSafeInteger)
            && r.totalCents >= 0 && r.totalCents <= amountCents;
        }),
      );
    });

    it('gastar mais nunca gera menos imposto (monotonicidade)', () => {
      fc.assert(
        fc.property(anyAmount, anyAmount, anyCategory, anyUf, (a, b, category, uf) => {
          const [low, high] = a <= b ? [a, b] : [b, a];
          return calculateTax(table, { amountCents: low, category, uf }).totalCents
            <= calculateTax(table, { amountCents: high, category, uf }).totalCents;
        }),
      );
    });

    it('o erro de arredondamento é de no máximo 1 centavo por esfera', () => {
      fc.assert(
        fc.property(anyAmount, anyUf, (amountCents, uf) => {
          const r = calculateTax(table, { amountCents, category: 'mercado', uf });
          const exact = (amountCents * r.ratePct) / 100;
          return Math.abs(r.totalCents - exact) <= 1.5;
        }),
      );
    });
  });
});
