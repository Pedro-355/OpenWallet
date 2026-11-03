import { describe, expect, it } from 'vitest';
import { formatBRL, isUF, validateRatesTable } from './index.js';
import { loadRatesFile } from './node.js';
import { aRatesTable } from '../test/factories.js';

describe('validateRatesTable', () => {
  it('aceita uma tabela válida e devolve a mesma referência', () => {
    const table = aRatesTable();
    expect(validateRatesTable(table)).toBe(table);
  });

  it('aceita a tabela distribuída com o pacote', () => {
    const table = loadRatesFile();
    expect(Object.keys(table.categories).length).toBeGreaterThan(5);
    expect(table.categories[table.fallbackCategory]).toBeDefined();
  });

  const mutate = (fn: (t: Record<string, any>) => void) => {
    const t = structuredClone(aRatesTable()) as Record<string, any>;
    fn(t);
    return t;
  };

  it.each([
    ['não é objeto', null, /não é um objeto/],
    ['sem versão', mutate((t) => delete t.version), /version/],
    ['sem source', mutate((t) => delete t.source), /source/],
    ['sem illustrative', mutate((t) => delete t.illustrative), /illustrative/],
    ['sem fallbackCategory', mutate((t) => delete t.fallbackCategory), /fallbackCategory ausente/],
    ['sem categorias', mutate((t) => delete t.categories), /categories/],
    ['fallback inexistente', mutate((t) => (t.fallbackCategory = 'xyz')), /não existe/],
    ['chave com maiúscula', mutate((t) => (t.categories.Mercado = t.categories.mercado)), /chave de categoria/],
    ['sem label', mutate((t) => delete t.categories.mercado.label), /label/],
    ['federal acima de 100', mutate((t) => (t.categories.mercado.federal = 120)), /federal/],
    ['federal negativo', mutate((t) => (t.categories.mercado.federal = -1)), /federal/],
    ['municipal inválido', mutate((t) => (t.categories.mercado.municipal = '5')), /municipal/],
    ['estadualPadrao inválido', mutate((t) => (t.categories.mercado.estadualPadrao = Infinity)), /estadualPadrao/],
    ['sem estadual', mutate((t) => delete t.categories.mercado.estadual), /estadual ausente/],
    ['UF inexistente', mutate((t) => (t.categories.mercado.estadual = { XX: 1 })), /UF inválida/],
    ['ICMS inválido', mutate((t) => (t.categories.mercado.estadual = { SP: 101 })), /estadual\.SP/],
  ])('rejeita tabela %s', (_caso, input, erro) => {
    expect(() => validateRatesTable(input)).toThrow(erro);
  });
});

describe('isUF', () => {
  it.each(['SP', 'DF', 'TO'])('reconhece %s', (uf) => expect(isUF(uf)).toBe(true));
  it.each(['sp', 'XX', '', 12, null])('recusa %s', (v) => expect(isUF(v)).toBe(false));
});

describe('formatBRL', () => {
  it('formata centavos em reais no padrão brasileiro', () => {
    expect(formatBRL(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
  });
});
