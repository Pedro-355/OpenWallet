/**
 * IRPF e INSS — mensal (holerite / carnê-leão) e anual (declaração de ajuste).
 * Tudo em centavos inteiros.
 */
import { PARAMS_2026, type FaixaIR, type ParametrosFiscais } from './params.js';

const r = Math.round;

/** INSS progressivo do empregado: cada alíquota só incide sobre a parte do salário dentro da faixa. */
export function inssEmpregado(brutoCents: number, p: ParametrosFiscais = PARAMS_2026): number {
  let restante = Math.min(Math.max(0, brutoCents), p.inss.tetoCents);
  let anterior = 0;
  let total = 0;
  for (const [teto, aliq] of p.inss.faixas) {
    if (restante <= 0) break;
    const naFaixa = Math.min(restante, teto - anterior);
    total += (naFaixa * aliq) / 100;
    restante -= naFaixa;
    anterior = teto;
  }
  return r(total);
}

/** INSS do autônomo (contribuinte individual, plano normal): 20% até o teto. */
export function inssAutonomo(rendimentoCents: number, p: ParametrosFiscais = PARAMS_2026): number {
  const base = Math.min(Math.max(0, rendimentoCents), p.inss.tetoCents);
  if (base < p.salarioMinimoCents) return r((p.salarioMinimoCents * p.inss.autonomoPct) / 100);
  return r((base * p.inss.autonomoPct) / 100);
}

export function impostoPelaTabela(baseCents: number, faixas: readonly FaixaIR[]): { impostoCents: number; aliquotaPct: number } {
  const base = Math.max(0, baseCents);
  for (const [teto, aliq, deduzir] of faixas) {
    if (base <= teto) return { impostoCents: Math.max(0, r((base * aliq) / 100 - deduzir)), aliquotaPct: aliq };
  }
  return { impostoCents: 0, aliquotaPct: 0 };
}

function reducao(
  rendimentoCents: number,
  impostoCents: number,
  red: { isencaoAteCents: number; maxCents: number; faixaAteCents: number; aCents: number; b: number },
): number {
  if (rendimentoCents <= red.isencaoAteCents) return Math.min(impostoCents, red.maxCents);
  if (rendimentoCents <= red.faixaAteCents) {
    return Math.min(impostoCents, Math.max(0, r(red.aCents - red.b * rendimentoCents)));
  }
  return 0;
}

export interface IRMensalInput {
  /** Rendimento tributável bruto do mês (salário, pró-labore, aluguel, autônomo...). */
  brutoCents: number;
  /** INSS pago no mês. Se omitido e `tipo` for 'clt', é calculado. */
  inssCents?: number;
  dependentes?: number;
  pensaoAlimenticiaCents?: number;
  /** Despesas do livro-caixa (só autônomo no carnê-leão). */
  livroCaixaCents?: number;
  tipo?: 'clt' | 'autonomo';
}

export interface IRMensalResultado {
  brutoCents: number;
  inssCents: number;
  deducoesLegaisCents: number;
  usouDescontoSimplificado: boolean;
  baseCents: number;
  aliquotaPct: number;
  impostoTabelaCents: number;
  reducaoLei15270Cents: number;
  impostoCents: number;
  /** Imposto ÷ bruto, em % com 2 casas. */
  aliquotaEfetivaPct: number;
  liquidoCents: number;
}

/**
 * IR mensal (retido na fonte ou carnê-leão), com o redutor da Lei 15.270/2025.
 * Compara deduções legais × desconto simplificado mensal e usa o que for melhor.
 */
export function irMensal(input: IRMensalInput, p: ParametrosFiscais = PARAMS_2026): IRMensalResultado {
  const bruto = Math.max(0, input.brutoCents);
  const tipo = input.tipo ?? 'clt';
  const inss = input.inssCents ?? (tipo === 'clt' ? inssEmpregado(bruto, p) : inssAutonomo(bruto, p));
  const legais =
    inss +
    (input.dependentes ?? 0) * p.irMensal.dependenteCents +
    (input.pensaoAlimenticiaCents ?? 0) +
    (tipo === 'autonomo' ? input.livroCaixaCents ?? 0 : 0);
  const simplificado = p.irMensal.descontoSimplificadoCents;
  const usaSimplificado = simplificado > legais;
  const base = Math.max(0, bruto - (usaSimplificado ? simplificado : legais));
  const { impostoCents: tabela, aliquotaPct } = impostoPelaTabela(base, p.irMensal.faixas);
  const red = reducao(bruto, tabela, p.irMensal.reducao);
  const imposto = tabela - red;
  return {
    brutoCents: bruto,
    inssCents: inss,
    deducoesLegaisCents: legais,
    usouDescontoSimplificado: usaSimplificado,
    baseCents: base,
    aliquotaPct,
    impostoTabelaCents: tabela,
    reducaoLei15270Cents: red,
    impostoCents: imposto,
    aliquotaEfetivaPct: bruto > 0 ? Math.round((imposto / bruto) * 10_000) / 100 : 0,
    liquidoCents: bruto - inss - imposto,
  };
}

export interface IRAnualInput {
  rendimentosTributaveisCents: number;
  /** INSS (oficial) pago no ano. */
  inssCents: number;
  /** IR já retido na fonte ou pago no carnê-leão. */
  impostoPagoCents: number;
  dependentes: number;
  saudeCents: number;
  /** Despesas com educação por pessoa (titular + dependentes). Cada uma é limitada. */
  educacaoPorPessoaCents: number[];
  previdenciaPrivadaCents: number;
  pensaoAlimenticiaCents: number;
}

export interface IRAnualModelo {
  deducoesCents: number;
  baseCents: number;
  impostoTabelaCents: number;
  reducaoLei15270Cents: number;
  impostoDevidoCents: number;
  /** Positivo = a restituir; negativo = a pagar. */
  saldoCents: number;
}

export interface IRAnualResultado {
  completa: IRAnualModelo;
  simplificada: IRAnualModelo;
  melhor: 'completa' | 'simplificada';
  /** Quanto a melhor opção rende a mais que a outra. */
  vantagemCents: number;
  obrigadoADeclarar: boolean;
  obrigatoriedadeConfirmada: boolean;
  limitesAplicados: string[];
}

/** Simula a declaração de ajuste anual nos dois modelos e indica o melhor. */
export function irAnual(input: IRAnualInput, p: ParametrosFiscais = PARAMS_2026): IRAnualResultado {
  const a = p.irAnual;
  const rend = Math.max(0, input.rendimentosTributaveisCents);
  const limites: string[] = [];

  const educacao = input.educacaoPorPessoaCents.reduce((s, v) => {
    if (v > a.educacaoLimitePorPessoaCents) limites.push('educacao');
    return s + Math.min(Math.max(0, v), a.educacaoLimitePorPessoaCents);
  }, 0);
  const tetoPrev = r((rend * a.previdenciaPrivadaPct) / 100);
  if (input.previdenciaPrivadaCents > tetoPrev) limites.push('previdencia_privada');
  const prev = Math.min(Math.max(0, input.previdenciaPrivadaCents), tetoPrev);

  const completaDed =
    Math.max(0, input.inssCents) +
    Math.max(0, input.dependentes) * a.dependenteCents +
    Math.max(0, input.saudeCents) +
    educacao +
    prev +
    Math.max(0, input.pensaoAlimenticiaCents);
  const simplesBruto = r((rend * a.descontoSimplificadoPct) / 100);
  if (simplesBruto > a.descontoSimplificadoLimiteCents) limites.push('desconto_simplificado');
  const simplesDed = Math.min(simplesBruto, a.descontoSimplificadoLimiteCents);

  const modelo = (ded: number): IRAnualModelo => {
    const base = Math.max(0, rend - ded);
    const tabela = impostoPelaTabela(base, a.faixas).impostoCents;
    const red = reducao(rend, tabela, a.reducao);
    const devido = tabela - red;
    return {
      deducoesCents: ded,
      baseCents: base,
      impostoTabelaCents: tabela,
      reducaoLei15270Cents: red,
      impostoDevidoCents: devido,
      saldoCents: Math.max(0, input.impostoPagoCents) - devido,
    };
  };
  const completa = modelo(completaDed);
  const simplificada = modelo(simplesDed);
  const melhor = completa.impostoDevidoCents <= simplificada.impostoDevidoCents ? 'completa' : 'simplificada';
  return {
    completa,
    simplificada,
    melhor,
    vantagemCents: Math.abs(completa.impostoDevidoCents - simplificada.impostoDevidoCents),
    obrigadoADeclarar: rend > a.obrigatoriedadeCents,
    obrigatoriedadeConfirmada: a.obrigatoriedadeConfirmada,
    limitesAplicados: limites,
  };
}
