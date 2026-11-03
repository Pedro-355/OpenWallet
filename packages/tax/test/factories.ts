import type { TaxRatesTable } from '../src/index.js';

/**
 * Builder de tabela de alíquotas para testes: informe só o que importa para o caso.
 * As categorias informadas são somadas às padrão (mercado, servicos, outros).
 */
export function aRatesTable(overrides: Partial<TaxRatesTable> = {}): TaxRatesTable {
  const base: TaxRatesTable = {
    version: 'teste-1',
    source: 'tabela de teste',
    illustrative: true,
    fallbackCategory: 'outros',
    categories: {
      mercado: { label: 'Mercado', federal: 13.45, estadual: { SP: 18, RJ: 20 }, estadualPadrao: 17 },
      servicos: { label: 'Serviços', federal: 10, municipal: 5, estadual: {} },
      outros: { label: 'Outros', federal: 10, estadual: {}, estadualPadrao: 10 },
    },
  };
  return { ...base, ...overrides, categories: { ...base.categories, ...overrides.categories } };
}
