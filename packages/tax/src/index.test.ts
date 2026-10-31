import { describe, expect, it } from 'vitest';
import { calculateTax, validateRatesTable, type TaxRatesTable } from './index.js';
import { loadRatesFile } from './node.js';

const table: TaxRatesTable = {
  version: 't1',
  source: 'teste',
  illustrative: true,
  fallbackCategory: 'outros',
  categories: {
    mercado: { label: 'Mercado', federal: 13.45, estadual: { SP: 18, RJ: 20 }, estadualPadrao: 17 },
    servicos: { label: 'Serviços', federal: 10, municipal: 5, estadual: {} },
    outros: { label: 'Outros', federal: 10, estadual: {}, estadualPadrao: 10 },
    absurdo: { label: 'x', federal: 60, estadual: {}, estadualPadrao: 60 },
  },
};

describe('calculateTax', () => {
  it('calcula o exemplo clássico: R$ 100 com 13,45% + 18% = R$ 31,45', () => {
    const r = calculateTax(table, { amountCents: 10_000, category: 'mercado', uf: 'SP' });
    expect(r).toMatchObject({ federalCents: 1345, estadualCents: 1800, municipalCents: 0, totalCents: 3145, ratePct: 31.45 });
  });

  it('usa o ICMS da UF do gasto', () => {
    const rj = calculateTax(table, { amountCents: 10_000, category: 'mercado', uf: 'RJ' });
    expect(rj.estadualCents).toBe(2000);
  });

  it('usa estadualPadrao quando a UF não está na tabela', () => {
    const ba = calculateTax(table, { amountCents: 10_000, category: 'mercado', uf: 'BA' });
    expect(ba.estadualCents).toBe(1700);
  });

  it('serviços somam ISS municipal', () => {
    const r = calculateTax(table, { amountCents: 5_000, category: 'servicos', uf: 'SP' });
    expect(r).toMatchObject({ federalCents: 500, estadualCents: 0, municipalCents: 250, totalCents: 750 });
  });

  it('categoria desconhecida cai na categoria padrão', () => {
    const r = calculateTax(table, { amountCents: 1_000, category: 'nao-existe', uf: 'SP' });
    expect(r.category).toBe('outros');
    expect(r.totalCents).toBe(200);
  });

  it('total é sempre a soma das parcelas, mesmo com arredondamento', () => {
    for (let cents = 1; cents < 2_000; cents += 7) {
      const r = calculateTax(table, { amountCents: cents, category: 'mercado', uf: 'SP' });
      expect(r.totalCents).toBe(r.federalCents + r.estadualCents + r.municipalCents);
    }
  });

  it('imposto nunca passa do valor pago', () => {
    const r = calculateTax(table, { amountCents: 999, category: 'absurdo', uf: 'SP' });
    expect(r.totalCents).toBeLessThanOrEqual(999);
    expect(r.ratePct).toBe(100);
  });

  it('rejeita valores inválidos', () => {
    expect(() => calculateTax(table, { amountCents: -1, category: 'mercado', uf: 'SP' })).toThrow();
    expect(() => calculateTax(table, { amountCents: 1.5, category: 'mercado', uf: 'SP' })).toThrow();
  });
});

describe('validateRatesTable', () => {
  it('aceita a tabela distribuída com o pacote', () => {
    const t = loadRatesFile();
    expect(Object.keys(t.categories).length).toBeGreaterThan(5);
  });

  it('rejeita percentuais fora de 0–100 e UFs inválidas', () => {
    const bad = structuredClone(table) as unknown as { categories: Record<string, { federal: number; estadual: Record<string, number> }> };
    bad.categories.mercado!.federal = 120;
    expect(() => validateRatesTable(bad)).toThrow(/federal/);
    const bad2 = structuredClone(table) as unknown as typeof bad;
    bad2.categories.mercado!.estadual = { XX: 1 };
    expect(() => validateRatesTable(bad2)).toThrow(/UF inválida/);
  });
});

import { categoryFromMcc } from './index.js';
describe('categoryFromMcc', () => {
  it('mapeia MCCs conhecidos e usa o padrão nos demais', () => {
    expect(categoryFromMcc(5411)).toBe('mercado');
    expect(categoryFromMcc(5541)).toBe('combustivel');
    expect(categoryFromMcc(4121)).toBe('transporte');
    expect(categoryFromMcc(1234)).toBe('outros');
    expect(categoryFromMcc(null)).toBe('outros');
  });
});
