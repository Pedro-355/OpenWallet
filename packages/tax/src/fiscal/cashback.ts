/**
 * Cashback da reforma tributária (LC 214/2025, arts. 112 a 124).
 *
 * Quem tem direito: responsável por família no CadÚnico, com renda familiar per capita
 * de até meio salário mínimo, residente no Brasil e com CPF regular (art. 113).
 * Quanto volta (art. 118): 100% da CBS e 20% do IBS em gás de cozinha (botijão até 13 kg),
 * energia, água, esgoto, gás canalizado e telecom; 20% de cada um nos demais.
 * Quando: CBS a partir de jan/2027; IBS a partir de jan/2029 (art. 123).
 *
 * As alíquotas de CBS/IBS usadas aqui são ESTIMATIVAS: a alíquota de referência
 * ainda depende de resolução do Senado. O app sempre mostra o resultado como estimativa.
 */
import { PARAMS_2026, type ParametrosFiscais } from './params.js';

/** Categorias do impostômetro tratadas como "essenciais" (contas da casa). */
export const CATEGORIAS_ESSENCIAIS = new Set(['moradia', 'telecom']);

/**
 * Parte do gasto que de fato paga CBS/IBS cheios. Estimativa: a cesta básica nacional tem
 * alíquota zero e vários itens de mercado e saúde têm redução de 60%, então só uma fração
 * do que se gasta nessas categorias gera cashback.
 */
export const FRACAO_TRIBUTADA: Record<string, number> = {
  mercado: 0.5,
  saude: 0.5,
  restaurante: 0.6,
};

export interface PerfilCashback {
  inscritoCadUnico: boolean;
  pessoasNaFamilia: number;
  rendaFamiliarMensalCents: number;
}

export interface Elegibilidade {
  elegivel: boolean;
  rendaPerCapitaCents: number;
  limitePerCapitaCents: number;
  motivos: string[];
}

export function elegibilidadeCashback(perfil: PerfilCashback, p: ParametrosFiscais = PARAMS_2026): Elegibilidade {
  const pessoas = Math.max(1, Math.floor(perfil.pessoasNaFamilia || 1));
  const perCapita = Math.round(Math.max(0, perfil.rendaFamiliarMensalCents) / pessoas);
  const motivos: string[] = [];
  if (!perfil.inscritoCadUnico) motivos.push('A família precisa estar inscrita e com o cadastro atualizado no CadÚnico.');
  if (perCapita > p.cashback.rendaPerCapitaMaxCents) {
    motivos.push('A renda por pessoa da família passa de meio salário mínimo.');
  }
  return { elegivel: motivos.length === 0, rendaPerCapitaCents: perCapita, limitePerCapitaCents: p.cashback.rendaPerCapitaMaxCents, motivos };
}

export interface GastoCashback {
  categoria: string;
  valorCents: number;
  /** AAAA-MM-DD */
  data: string;
  /** CPF informado na nota? null = não sabemos (ex.: compra no cartão sem nota lida). */
  cpfNaNota: boolean | null;
}

export interface EstimativaCashback {
  /** Começa a valer? (antes de 2027 tudo é simulação) */
  vigente: boolean;
  totalComCpfCents: number;
  /** Quanto voltaria se todas as compras tivessem CPF na nota. */
  potencialCents: number;
  /** Diferença: o que se perde por não pedir CPF na nota. */
  perdidoSemCpfCents: number;
  porCategoria: { categoria: string; essencial: boolean; gastoCents: number; cashbackCents: number }[];
  aliquotasEstimadas: { cbsPct: number; ibsPct: number };
}

/** Tributo embutido num preço final (imposto "por fora" na nova regra, aqui extraído do total pago). */
const embutido = (valor: number, aliqPct: number) => (valor * aliqPct) / (100 + aliqPct);

/**
 * Estima o cashback de um conjunto de gastos.
 * Contas da casa (luz, água, gás canalizado, telecom) recebem a devolução direto na conta
 * pelo CPF do titular, então contam como "com CPF" mesmo sem nota lida.
 */
export function estimarCashback(gastos: GastoCashback[], p: ParametrosFiscais = PARAMS_2026): EstimativaCashback {
  const c = p.cashback;
  const cats = new Map<string, { gasto: number; cash: number; essencial: boolean }>();
  let comCpf = 0;
  let potencial = 0;
  let vigente = false;

  for (const g of gastos) {
    const mes = g.data.slice(0, 7);
    const cbsAtiva = mes >= c.inicioCbs;
    const ibsAtiva = mes >= c.inicioIbs;
    if (cbsAtiva) vigente = true;
    const essencial = CATEGORIAS_ESSENCIAIS.has(g.categoria);
    const pct = essencial ? c.essenciais : c.demais;
    const base = Math.max(0, g.valorCents) * (FRACAO_TRIBUTADA[g.categoria] ?? 1);
    // Antes de 2027 é simulação com as regras de 2027 (só CBS). O IBS só entra a partir de 2029.
    const cbs = embutido(base, c.cbsAliquotaEstimadaPct) * (pct.cbsPct / 100);
    const ibs = ibsAtiva ? embutido(base, c.ibsAliquotaEstimadaPct) * (pct.ibsPct / 100) : 0;
    const valor = Math.round(cbs + ibs);
    potencial += valor;
    if (essencial || g.cpfNaNota === true) comCpf += valor;
    const item = cats.get(g.categoria) ?? { gasto: 0, cash: 0, essencial };
    item.gasto += g.valorCents;
    item.cash += valor;
    cats.set(g.categoria, item);
  }

  return {
    vigente,
    totalComCpfCents: comCpf,
    potencialCents: potencial,
    perdidoSemCpfCents: potencial - comCpf,
    porCategoria: [...cats.entries()]
      .map(([categoria, v]) => ({ categoria, essencial: v.essencial, gastoCents: v.gasto, cashbackCents: v.cash }))
      .sort((a, b) => b.cashbackCents - a.cashbackCents),
    aliquotasEstimadas: { cbsPct: c.cbsAliquotaEstimadaPct, ibsPct: c.ibsAliquotaEstimadaPct },
  };
}
