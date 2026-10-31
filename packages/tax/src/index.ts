/**
 * Impostômetro — cálculo da carga tributária aproximada embutida num gasto.
 *
 * O imposto no Brasil é "por dentro": ele já está contido no preço pago.
 * Então, para um gasto de R$ 100 com carga de 31,45%, R$ 31,45 foram impostos.
 *
 * Os percentuais seguem a lógica da tabela IBPT (Lei 12.741/2012), que separa:
 *  - federal   (PIS, Cofins, IPI, IOF...) — igual no país inteiro
 *  - estadual  (ICMS)                     — varia por UF
 *  - municipal (ISS)                      — só para serviços
 *
 * Este módulo é puro (sem I/O) para rodar igual no servidor e no navegador.
 */

export const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const;

export type UF = (typeof UFS)[number];

export function isUF(value: unknown): value is UF {
  return typeof value === 'string' && (UFS as readonly string[]).includes(value);
}

export interface CategoryRates {
  /** Nome para exibir na tela. */
  label: string;
  /** % federal sobre o valor pago (ex.: 13.45 = 13,45%). */
  federal: number;
  /** % municipal (ISS). Padrão 0. */
  municipal?: number;
  /** % estadual (ICMS) por UF. UF ausente usa `estadualPadrao`. */
  estadual: Partial<Record<UF, number>>;
  /** % estadual usado quando a UF não está no mapa. Padrão 0. */
  estadualPadrao?: number;
}

export interface TaxRatesTable {
  /** Identificador da versão das alíquotas (fica gravado em cada gasto). */
  version: string;
  /** De onde vieram os números (ex.: "IBPT 26.2.A"). */
  source: string;
  /** true quando os números são ilustrativos e ainda não vieram do IBPT. */
  illustrative: boolean;
  /** Categoria usada quando o gasto vem com uma categoria desconhecida. */
  fallbackCategory: string;
  categories: Record<string, CategoryRates>;
}

export interface TaxBreakdown {
  category: string;
  uf: UF;
  amountCents: number;
  federalCents: number;
  estadualCents: number;
  municipalCents: number;
  totalCents: number;
  /** Carga total aplicada, em % (ex.: 31.45). */
  ratePct: number;
  ratesVersion: string;
}

const MAX_PCT = 100;

/** Resolve as alíquotas (em %) de uma categoria para uma UF. */
export function resolveRates(
  table: TaxRatesTable,
  category: string,
  uf: UF,
): { category: string; federal: number; estadual: number; municipal: number } {
  const key = table.categories[category] ? category : table.fallbackCategory;
  const cat = table.categories[key];
  if (!cat) {
    throw new Error(`Tabela de alíquotas sem a categoria padrão "${table.fallbackCategory}"`);
  }
  return {
    category: key,
    federal: cat.federal,
    estadual: cat.estadual[uf] ?? cat.estadualPadrao ?? 0,
    municipal: cat.municipal ?? 0,
  };
}

/**
 * Calcula o imposto contido num gasto.
 *
 * Trabalha em centavos inteiros para não acumular erro de ponto flutuante.
 * Cada parcela é arredondada separadamente e o total é a soma das parcelas,
 * então "federal + estadual + municipal" sempre bate com o total exibido.
 */
export function calculateTax(
  table: TaxRatesTable,
  input: { amountCents: number; category: string; uf: UF },
): TaxBreakdown {
  const { amountCents, uf } = input;
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new RangeError('amountCents deve ser um inteiro >= 0');
  }
  const r = resolveRates(table, input.category, uf);
  const part = (pct: number) => Math.round((amountCents * pct) / 100);

  let federalCents = part(r.federal);
  let estadualCents = part(r.estadual);
  let municipalCents = part(r.municipal);
  let totalCents = federalCents + estadualCents + municipalCents;

  // Proteção: o imposto nunca pode passar do valor pago.
  if (totalCents > amountCents) {
    const scale = amountCents / totalCents;
    federalCents = Math.floor(federalCents * scale);
    estadualCents = Math.floor(estadualCents * scale);
    municipalCents = Math.floor(municipalCents * scale);
    totalCents = federalCents + estadualCents + municipalCents;
  }

  const ratePct = Math.min(MAX_PCT, round2(r.federal + r.estadual + r.municipal));
  return {
    category: r.category,
    uf,
    amountCents,
    federalCents,
    estadualCents,
    municipalCents,
    totalCents,
    ratePct,
    ratesVersion: table.version,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Valida a estrutura da tabela. Lança erro descritivo se algo estiver errado. */
export function validateRatesTable(value: unknown): TaxRatesTable {
  const fail = (msg: string): never => {
    throw new Error(`Tabela de alíquotas inválida: ${msg}`);
  };
  const isPct = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX_PCT;

  if (typeof value !== 'object' || value === null) fail('não é um objeto');
  const t = value as Record<string, unknown>;
  if (typeof t.version !== 'string' || !t.version) fail('version ausente');
  if (typeof t.source !== 'string') fail('source ausente');
  if (typeof t.illustrative !== 'boolean') fail('illustrative ausente');
  if (typeof t.fallbackCategory !== 'string') fail('fallbackCategory ausente');
  if (typeof t.categories !== 'object' || t.categories === null) fail('categories ausente');

  const cats = t.categories as Record<string, Record<string, unknown>>;
  for (const [key, c] of Object.entries(cats)) {
    if (!/^[a-z0-9_]+$/.test(key)) fail(`chave de categoria inválida "${key}"`);
    if (typeof c.label !== 'string') fail(`${key}.label ausente`);
    if (!isPct(c.federal)) fail(`${key}.federal inválido`);
    if (c.municipal !== undefined && !isPct(c.municipal)) fail(`${key}.municipal inválido`);
    if (c.estadualPadrao !== undefined && !isPct(c.estadualPadrao)) fail(`${key}.estadualPadrao inválido`);
    if (typeof c.estadual !== 'object' || c.estadual === null) fail(`${key}.estadual ausente`);
    for (const [uf, pct] of Object.entries(c.estadual as object)) {
      if (!isUF(uf)) fail(`${key}.estadual tem UF inválida "${uf}"`);
      if (!isPct(pct)) fail(`${key}.estadual.${uf} inválido`);
    }
  }
  if (!cats[t.fallbackCategory as string]) fail('fallbackCategory não existe em categories');
  return value as TaxRatesTable;
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export { categoryFromMcc } from './mcc.js';
