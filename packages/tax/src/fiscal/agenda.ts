/**
 * Agenda de obrigações: dias úteis, vencimentos recorrentes (DAS do MEI, carnê-leão,
 * declarações) e a conta "à vista ou parcelado?" de IPVA/IPTU.
 * Datas no formato AAAA-MM-DD, sem fuso (dia civil de Brasília).
 */

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const toDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
};
const fromDate = (d: Date) => d.toISOString().slice(0, 10);
export const addDias = (s: string, n: number) => {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDate(d);
};

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(ano, mes, dia);
}

/** Feriados nacionais e dias sem expediente bancário (Carnaval, Sexta-feira Santa, Corpus Christi). */
export function feriadosNacionais(ano: number): Set<string> {
  const p = pascoa(ano);
  return new Set([
    iso(ano, 1, 1), iso(ano, 4, 21), iso(ano, 5, 1), iso(ano, 9, 7), iso(ano, 10, 12),
    iso(ano, 11, 2), iso(ano, 11, 15), iso(ano, 11, 20), iso(ano, 12, 25),
    addDias(p, -48), addDias(p, -47), // segunda e terça de Carnaval
    addDias(p, -2), // Sexta-feira Santa
    addDias(p, 60), // Corpus Christi
  ]);
}

export function diaUtil(s: string): boolean {
  const dow = toDate(s).getUTCDay();
  return dow !== 0 && dow !== 6 && !feriadosNacionais(Number(s.slice(0, 4))).has(s);
}

export function proximoDiaUtil(s: string): string {
  let d = s;
  while (!diaUtil(d)) d = addDias(d, 1);
  return d;
}

export function diaUtilAnterior(s: string): string {
  let d = s;
  while (!diaUtil(d)) d = addDias(d, -1);
  return d;
}

export function ultimoDiaUtilDoMes(ano: number, mes: number): string {
  return diaUtilAnterior(fromDate(new Date(Date.UTC(ano, mes, 0))));
}

export type TipoObrigacao = 'das_mei' | 'dasn_simei' | 'carne_leao' | 'dirpf' | 'ipva' | 'iptu' | 'outro';

export interface Vencimento {
  tipo: TipoObrigacao;
  titulo: string;
  vencimento: string;
  /** Mês/ano a que o pagamento se refere (competência), quando houver. */
  competencia?: string;
  /** true quando a data é prevista e ainda depende de ato oficial. */
  previsto?: boolean;
  dica: string;
}

export interface PerfilAgenda {
  mei: boolean;
  /** Recebe de pessoa física ou do exterior (autônomo, aluguel) → carnê-leão. */
  carneLeao: boolean;
  /** Precisa declarar IRPF. */
  declaraIr: boolean;
}

/** Vencimentos automáticos entre duas datas (inclusive), a partir do perfil. */
export function vencimentosRecorrentes(perfil: PerfilAgenda, de: string, ate: string): Vencimento[] {
  const out: Vencimento[] = [];
  const [y0, m0] = de.split('-').map(Number) as [number, number];
  const [y1, m1] = ate.split('-').map(Number) as [number, number];
  for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? (y++, (m = 1)) : m++) {
    const compAnterior = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
    if (perfil.mei) {
      out.push({
        tipo: 'das_mei',
        titulo: 'DAS do MEI',
        competencia: compAnterior,
        // Dia 20; em fim de semana/feriado as fontes divergem (antecipa × prorroga): usamos o dia útil
        // anterior, que nunca deixa a pessoa em atraso.
        vencimento: diaUtilAnterior(iso(y, m, 20)),
        dica: 'Pague pelo app MEI ou Pix no PGMEI. Atraso tem multa de 0,33% ao dia (até 20%) + Selic.',
      });
    }
    if (perfil.carneLeao) {
      out.push({
        tipo: 'carne_leao',
        titulo: 'Carnê-leão',
        competencia: compAnterior,
        vencimento: ultimoDiaUtilDoMes(y, m),
        dica: 'Lance os recebimentos de pessoa física do mês anterior no Carnê-Leão Web (e-CAC) e gere o DARF.',
      });
    }
    if (m === 5) {
      if (perfil.mei) {
        out.push({
          tipo: 'dasn_simei',
          titulo: 'Declaração anual do MEI (DASN-SIMEI)',
          vencimento: iso(y, 5, 31),
          dica: 'Informe o faturamento do ano anterior, separando comércio e serviços.',
        });
      }
      if (perfil.declaraIr) {
        out.push({
          tipo: 'dirpf',
          titulo: 'Declaração do Imposto de Renda',
          vencimento: ultimoDiaUtilDoMes(y, 5),
          previsto: true,
          dica: 'Envie cedo: quem entrega primeiro (e usa a pré-preenchida com Pix) recebe a restituição antes.',
        });
      }
    }
  }
  return out.filter((v) => v.vencimento >= de && v.vencimento <= ate).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

export interface AvistaOuParcelado {
  avistaCents: number;
  parceladoTotalCents: number;
  economiaAvistaCents: number;
  /** Juros mensais embutidos no parcelamento, em %. */
  jurosImplicitoMensalPct: number;
  recomendacao: 'avista' | 'parcelado' | 'tanto_faz';
  explicacao: string;
}

/**
 * Compara pagar à vista (com desconto) com parcelar sem desconto.
 * Se o dinheiro rende menos por mês do que os juros embutidos no parcelamento, compensa pagar à vista.
 * Considera a primeira parcela paga junto com a opção à vista.
 */
export function avistaOuParcelado(input: {
  valorCents: number;
  descontoAvistaPct: number;
  parcelas: number;
  /** Quanto o dinheiro parado rende por mês (ex.: 1 = 1% a.m.). */
  rendimentoMensalPct: number;
}): AvistaOuParcelado {
  const total = Math.max(0, input.valorCents);
  const n = Math.max(1, Math.floor(input.parcelas));
  const avista = Math.round(total * (1 - Math.min(100, Math.max(0, input.descontoAvistaPct)) / 100));
  const parcela = total / n;
  // Valor presente das parcelas a uma taxa i (1ª parcela hoje).
  const vp = (i: number) => {
    let s = 0;
    for (let k = 0; k < n; k++) s += parcela / (1 + i) ** k;
    return s;
  };
  let juros = 0;
  if (n > 1 && avista < total) {
    let lo = 0;
    let hi = 1;
    for (let it = 0; it < 100; it++) {
      const mid = (lo + hi) / 2;
      if (vp(mid) > avista) lo = mid;
      else hi = mid;
    }
    juros = Math.round(((lo + hi) / 2) * 1_000_000) / 10_000;
  }
  const rende = input.rendimentoMensalPct;
  let recomendacao: AvistaOuParcelado['recomendacao'] = 'tanto_faz';
  if (juros - rende > 0.05) recomendacao = 'avista';
  else if (rende - juros > 0.05) recomendacao = 'parcelado';
  const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const explicacao =
    recomendacao === 'avista'
      ? `O desconto equivale a ${fmt(juros)}% ao mês, mais do que os ${fmt(rende)}% que o dinheiro renderia. Pague à vista se tiver o dinheiro sem se apertar.`
      : recomendacao === 'parcelado'
        ? `Parcelar custa ${fmt(juros)}% ao mês e o dinheiro aplicado rende ${fmt(rende)}%: deixe o dinheiro rendendo e parcele.`
        : 'As duas opções dão praticamente o mesmo resultado. Escolha a que pesa menos no seu mês.';
  return {
    avistaCents: avista,
    parceladoTotalCents: total,
    economiaAvistaCents: total - avista,
    jurosImplicitoMensalPct: juros,
    recomendacao,
    explicacao,
  };
}
