export const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const monthShort = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;
export const monthLong = (ym: string) => `${MONTHS_LONG[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function lastDay(ym: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** "12,34" ou "12.34" ou "1.234,56" -> centavos. */
export function parseMoney(input: string): number | null {
  const clean = input.trim().replace(/[^\d,.-]/g, '');
  if (!clean) return null;
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/**
 * Valor digitado em reais, no jeito brasileiro: "90.000" e "1.234.567" são milhares (não decimais).
 * Para o resto, segue parseMoney ("12,34", "12.34", "1.234,56").
 */
export function parseReais(input: string): number | null {
  const t = input.trim().replace(/^R\$\s*/i, '');
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return parseMoney(t.replace(/\./g, ''));
  return parseMoney(t);
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Data em listas, como pede o design system: "Hoje", "Ontem", "28 out" (e o ano se não for o atual). */
export function dataLista(iso: string, hoje = todayISO()): string {
  if (iso === hoje) return 'Hoje';
  const ontem = new Date(`${hoje}T12:00:00Z`);
  ontem.setUTCDate(ontem.getUTCDate() - 1);
  if (iso === ontem.toISOString().slice(0, 10)) return 'Ontem';
  const base = `${Number(iso.slice(8, 10))} ${MESES_CURTOS[Number(iso.slice(5, 7)) - 1]}`;
  return iso.slice(0, 4) === hoje.slice(0, 4) ? base : `${base} ${iso.slice(0, 4)}`;
}

/** Data por extenso: "Hoje, 28 de outubro" / "3 de novembro de 2027". */
export function dataExtenso(iso: string, hoje = todayISO()): string {
  const d = `${Number(iso.slice(8, 10))} de ${MONTHS_LONG[Number(iso.slice(5, 7)) - 1]}`;
  if (iso === hoje) return `Hoje, ${d}`;
  return iso.slice(0, 4) === hoje.slice(0, 4) ? d : `${d} de ${iso.slice(0, 4)}`;
}

/** Mês no formato do design system: "Out 2026". */
export const mesAno = (ym: string) => `${capitalize(MESES_CURTOS[Number(ym.slice(5, 7)) - 1] ?? '')} ${ym.slice(0, 4)}`;
