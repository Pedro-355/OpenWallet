/**
 * MEI: DAS mensal, controle do limite de faturamento e comparação de regimes
 * (MEI × Simples Nacional × autônomo pessoa física).
 */
import { PARAMS_2026, type ParametrosFiscais } from './params.js';
import { inssAutonomo, irAnual, irMensal } from './irpf.js';

export type AtividadeMei = 'comercio' | 'servicos' | 'comercio_servicos';

/** DAS do MEI: 5% do salário mínimo (INSS) + R$ 1 de ICMS e/ou R$ 5 de ISS. */
export function dasMei(atividade: AtividadeMei, p: ParametrosFiscais = PARAMS_2026) {
  const inss = Math.round((p.salarioMinimoCents * p.inss.meiPct) / 100);
  const icms = atividade !== 'servicos' ? p.mei.icmsCents : 0;
  const iss = atividade !== 'comercio' ? p.mei.issCents : 0;
  return { inssCents: inss, icmsCents: icms, issCents: iss, totalCents: inss + icms + iss };
}

export type NivelLimite = 'ok' | 'atencao' | 'alerta' | 'excedido_tolerancia' | 'desenquadrado';

export interface StatusLimiteMei {
  limiteCents: number;
  faturadoCents: number;
  restanteCents: number;
  usadoPct: number;
  /** Meses considerados no limite (proporcional no ano da abertura). */
  mesesNoAno: number;
  nivel: NivelLimite;
  mensagem: string;
  /** Média mensal que ainda cabe até dezembro sem estourar. */
  mediaMensalDisponivelCents: number;
}

/**
 * Situação do faturamento no ano.
 * No ano da abertura o limite é proporcional: R$ 6.750 por mês, contando o mês de abertura.
 */
export function statusLimiteMei(
  input: { faturadoNoAnoCents: number; ano: number; mesAtual: number; abertura?: string | null },
  p: ParametrosFiscais = PARAMS_2026,
): StatusLimiteMei {
  const mensal = p.mei.limiteAnualCents / 12;
  let meses = 12;
  if (input.abertura) {
    const [ay, am] = input.abertura.split('-').map(Number) as [number, number];
    if (ay === input.ano) meses = 13 - am;
    if (ay > input.ano) meses = 0;
  }
  const limite = Math.round(mensal * meses);
  const fat = Math.max(0, input.faturadoNoAnoCents);
  const usado = limite > 0 ? Math.round((fat / limite) * 10_000) / 100 : 0;
  const tolerancia = Math.round(limite * (1 + p.mei.toleranciaPct / 100));
  const mesesRestantes = Math.max(1, 13 - input.mesAtual);

  let nivel: NivelLimite = 'ok';
  let mensagem = 'Tudo certo: você está dentro do limite do MEI.';
  if (fat > tolerancia) {
    nivel = 'desenquadrado';
    mensagem =
      'Você passou mais de 20% do limite. O desenquadramento é retroativo a janeiro (ou à abertura): procure um contador para recalcular os impostos como ME.';
  } else if (fat > limite) {
    nivel = 'excedido_tolerancia';
    mensagem =
      'Você passou do limite, mas em até 20%. Continua MEI até dezembro, paga um DAS complementar sobre o excesso e vira ME em janeiro.';
  } else if (usado >= 90) {
    nivel = 'alerta';
    mensagem = 'Falta pouco para o limite. Planeje as próximas notas ou a migração para ME.';
  } else if (usado >= 70) {
    nivel = 'atencao';
    mensagem = 'Você já usou mais de 70% do limite do ano.';
  }
  return {
    limiteCents: limite,
    faturadoCents: fat,
    restanteCents: Math.max(0, limite - fat),
    usadoPct: usado,
    mesesNoAno: meses,
    nivel,
    mensagem,
    mediaMensalDisponivelCents: Math.max(0, Math.round((limite - fat) / mesesRestantes)),
  };
}

/** Anexos do Simples Nacional (LC 123/2006, redação da LC 155/2016): [RBT12 até, alíquota %, parcela a deduzir em centavos]. */
export const ANEXOS_SIMPLES = {
  I: [
    [18_000_000, 4, 0], [36_000_000, 7.3, 594_000], [72_000_000, 9.5, 1_386_000],
    [180_000_000, 10.7, 2_250_000], [360_000_000, 14.3, 8_730_000], [480_000_000, 19, 37_800_000],
  ],
  III: [
    [18_000_000, 6, 0], [36_000_000, 11.2, 936_000], [72_000_000, 13.5, 1_764_000],
    [180_000_000, 16, 3_564_000], [360_000_000, 21, 12_564_000], [480_000_000, 33, 64_800_000],
  ],
  V: [
    [18_000_000, 15.5, 0], [36_000_000, 18, 450_000], [72_000_000, 19.5, 990_000],
    [180_000_000, 20.5, 1_710_000], [360_000_000, 23, 6_210_000], [480_000_000, 30.5, 54_000_000],
  ],
} as const satisfies Record<string, readonly (readonly [number, number, number])[]>;

export type Anexo = keyof typeof ANEXOS_SIMPLES;

/** Alíquota efetiva do Simples: (RBT12 × alíquota − parcela a deduzir) ÷ RBT12. */
export function aliquotaEfetivaSimples(rbt12Cents: number, anexo: Anexo): number | null {
  const tabela = ANEXOS_SIMPLES[anexo];
  if (rbt12Cents <= 0) return tabela[0][1];
  const faixa = tabela.find(([ate]) => rbt12Cents <= ate);
  if (!faixa) return null; // acima de R$ 4,8 milhões: fora do Simples
  const [, aliq, pd] = faixa;
  return Math.round((((rbt12Cents * aliq) / 100 - pd) / rbt12Cents) * 1_000_000) / 10_000;
}

export interface OpcaoRegime {
  regime: 'mei' | 'simples_anexo_i' | 'simples_anexo_iii' | 'simples_anexo_v' | 'autonomo_pf';
  nome: string;
  permitido: boolean;
  motivo?: string;
  impostoAnualCents: number;
  /** Parte do total que é contribuição ao INSS (conta para aposentadoria). */
  inssAnualCents: number;
  cargaPct: number;
  detalhes: string;
}

/**
 * Compara quanto se paga por ano em cada regime para um faturamento anual.
 * Simplificações (ditas na tela): ISS do autônomo e taxas municipais fora; pró-labore de 1 salário mínimo
 * no Simples, exceto quando o fator R exige mais (28% do faturamento) para cair no Anexo III.
 */
export function compararRegimes(
  input: { faturamentoAnualCents: number; atividade: AtividadeMei },
  p: ParametrosFiscais = PARAMS_2026,
): OpcaoRegime[] {
  const fat = Math.max(0, input.faturamentoAnualCents);
  const carga = (v: number) => (fat > 0 ? Math.round((v / fat) * 10_000) / 100 : 0);
  const out: OpcaoRegime[] = [];

  // MEI
  const das = dasMei(input.atividade, p);
  const meiOk = fat <= p.mei.limiteAnualCents;
  out.push({
    regime: 'mei',
    nome: 'MEI',
    permitido: meiOk,
    motivo: meiOk ? undefined : 'Faturamento acima de R$ 81 mil por ano.',
    impostoAnualCents: das.totalCents * 12,
    inssAnualCents: das.inssCents * 12,
    cargaPct: carga(das.totalCents * 12),
    detalhes: `DAS fixo de ${(das.totalCents / 100).toFixed(2).replace('.', ',')} por mês.`,
  });

  // Simples Nacional (ME) — custo do pró-labore: INSS 11% do sócio + IR na fonte do sócio.
  const custoProLabore = (mensalCents: number) => {
    const inss = Math.round((Math.min(mensalCents, p.inss.tetoCents) * 11) / 100);
    const ir = irMensal({ brutoCents: mensalCents, inssCents: inss }, p).impostoCents;
    return { inss: inss * 12, ir: ir * 12 };
  };
  const simples = (anexo: Anexo, proLaboreMensal: number, regime: OpcaoRegime['regime'], nome: string, extra: string) => {
    const aliq = aliquotaEfetivaSimples(fat, anexo);
    if (aliq === null) {
      out.push({ regime, nome, permitido: false, motivo: 'Faturamento acima do limite do Simples.', impostoAnualCents: 0, inssAnualCents: 0, cargaPct: 0, detalhes: '' });
      return;
    }
    const das = Math.round((fat * aliq) / 100);
    const pl = custoProLabore(proLaboreMensal);
    const total = das + pl.inss + pl.ir;
    out.push({
      regime,
      nome,
      permitido: true,
      impostoAnualCents: total,
      inssAnualCents: pl.inss,
      cargaPct: carga(total),
      detalhes: `DAS com alíquota efetiva de ${aliq.toLocaleString('pt-BR')}% + pró-labore de ${(proLaboreMensal / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês. ${extra}`.trim(),
    });
  };

  const minimo = p.salarioMinimoCents;
  if (input.atividade === 'servicos') {
    // Fator R ≥ 28%: folha (pró-labore) de pelo menos 28% do faturamento leva ao Anexo III.
    const proLaboreFatorR = Math.max(minimo, Math.ceil((fat * 0.28) / 12));
    simples('III', proLaboreFatorR, 'simples_anexo_iii', 'Simples Nacional — Anexo III (fator R)', 'Pró-labore de 28% do faturamento para atingir o fator R.');
    simples('V', minimo, 'simples_anexo_v', 'Simples Nacional — Anexo V', 'Sem fator R.');

    // Autônomo pessoa física: INSS de 20% (até o teto) + IR anual.
    const mensal = Math.round(fat / 12);
    const inssMes = inssAutonomo(mensal, p);
    const inssAno = inssMes * 12;
    const ir = irAnual(
      {
        rendimentosTributaveisCents: fat,
        inssCents: inssAno,
        impostoPagoCents: 0,
        dependentes: 0,
        saudeCents: 0,
        educacaoPorPessoaCents: [],
        previdenciaPrivadaCents: 0,
        pensaoAlimenticiaCents: 0,
      },
      p,
    );
    const irAno = Math.min(ir.completa.impostoDevidoCents, ir.simplificada.impostoDevidoCents);
    out.push({
      regime: 'autonomo_pf',
      nome: 'Autônomo (pessoa física, carnê-leão)',
      permitido: true,
      impostoAnualCents: inssAno + irAno,
      inssAnualCents: inssAno,
      cargaPct: carga(inssAno + irAno),
      detalhes: 'INSS de 20% até o teto + IR pela tabela progressiva. ISS municipal não incluído (depende da cidade).',
    });
  } else {
    simples('I', minimo, 'simples_anexo_i', 'Simples Nacional — Anexo I (comércio)', '');
  }

  return out.sort((a, b) => Number(b.permitido) - Number(a.permitido) || a.impostoAnualCents - b.impostoAnualCents);
}
