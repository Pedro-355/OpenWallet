import { readFileSync } from 'node:fs';
import { validateRatesTable, type TaxRatesTable } from './index.js';

/** Carrega e valida a tabela de alíquotas de um arquivo JSON (padrão: data/rates.json do pacote). */
export function loadRatesFile(path?: string): TaxRatesTable {
  const file = path ?? new URL('../data/rates.json', import.meta.url);
  return validateRatesTable(JSON.parse(readFileSync(file, 'utf8')));
}
