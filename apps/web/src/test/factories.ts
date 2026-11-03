import type { TaxRatesTable } from '@openwallet/tax';
import type { Expense, User } from '../api';

export const aUser = (o: Partial<User> = {}): User => ({ id: 'u1', email: 'pedro@teste.com', uf: 'SP', ...o });

export const aRatesTable = (): TaxRatesTable => ({
  version: 't1',
  source: 'teste',
  illustrative: true,
  fallbackCategory: 'outros',
  categories: {
    mercado: { label: 'Mercado', federal: 10, estadual: { SP: 18 }, estadualPadrao: 12 },
    combustivel: { label: 'Combustível', federal: 15, estadual: {}, estadualPadrao: 25 },
    outros: { label: 'Outros', federal: 10, estadual: {}, estadualPadrao: 10 },
  },
});

export const anExpense = (o: Partial<Expense> = {}): Expense => ({
  id: 'e1',
  amountCents: 10_000,
  category: 'mercado',
  description: 'Feira',
  uf: 'SP',
  spentOn: '2026-10-05',
  source: 'manual',
  tax: { federalCents: 1000, estadualCents: 1800, municipalCents: 0, totalCents: 2800, ratePct: 28, ratesVersion: 't1' },
  ...o,
});
