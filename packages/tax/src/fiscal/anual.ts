/**
 * Impostômetro pessoal anual: soma o imposto do consumo (já calculado gasto a gasto)
 * com IR, INSS e impostos sobre patrimônio (IPVA, IPTU), e traduz em "dias de trabalho".
 */

export interface ImpostometroAnualInput {
  ano: number;
  rendaBrutaCents: number;
  consumoCents: number;
  irCents: number;
  inssCents: number;
  patrimonioCents: number;
  outrosCents?: number;
}

export interface ImpostometroAnual {
  ano: number;
  totalCents: number;
  partes: { chave: 'consumo' | 'ir' | 'inss' | 'patrimonio' | 'outros'; rotulo: string; cents: number }[];
  /** Total ÷ renda bruta, em %. null sem renda informada. */
  pctDaRenda: number | null;
  /** Dias do ano que a renda inteira foi para impostos. */
  diasTrabalhados: number | null;
  /** Dia do ano em que você "parou de trabalhar para o governo" (AAAA-MM-DD). */
  liberdadeEm: string | null;
}

const diasNoAno = (ano: number) => ((ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0 ? 366 : 365);

export function impostometroAnual(i: ImpostometroAnualInput): ImpostometroAnual {
  const partes: ImpostometroAnual['partes'] = [
    { chave: 'consumo' as const, rotulo: 'Embutido no que você compra', cents: i.consumoCents },
    { chave: 'ir' as const, rotulo: 'Imposto de Renda', cents: i.irCents },
    { chave: 'inss' as const, rotulo: 'INSS', cents: i.inssCents },
    { chave: 'patrimonio' as const, rotulo: 'IPVA, IPTU e afins', cents: i.patrimonioCents },
    { chave: 'outros' as const, rotulo: 'DAS do MEI e outros', cents: i.outrosCents ?? 0 },
  ].map((p) => ({ ...p, cents: Math.max(0, Math.round(p.cents)) }));
  const total = partes.reduce((s, p) => s + p.cents, 0);

  if (i.rendaBrutaCents <= 0) {
    return { ano: i.ano, totalCents: total, partes: partes.filter((p) => p.cents > 0), pctDaRenda: null, diasTrabalhados: null, liberdadeEm: null };
  }
  const frac = Math.min(1, total / i.rendaBrutaCents);
  const dias = Math.round(frac * diasNoAno(i.ano));
  const d = new Date(Date.UTC(i.ano, 0, 1));
  d.setUTCDate(d.getUTCDate() + dias);
  return {
    ano: i.ano,
    totalCents: total,
    partes: partes.filter((p) => p.cents > 0),
    pctDaRenda: Math.round(frac * 10_000) / 100,
    diasTrabalhados: dias,
    liberdadeEm: d.toISOString().slice(0, 10),
  };
}
