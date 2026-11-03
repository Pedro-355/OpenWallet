/**
 * Parâmetros oficiais usados nos cálculos (valores em centavos).
 *
 * Mantenha um objeto por ano-calendário. Cada número traz a fonte ao lado;
 * os marcados com "a confirmar" ainda dependem de ato da Receita/Comitê Gestor.
 */

/** [limite superior da faixa em centavos, alíquota %, parcela a deduzir em centavos] */
export type FaixaIR = readonly [number, number, number];

export interface ParametrosFiscais {
  ano: number;
  /** Decreto nº 12.797/2025: R$ 1.621,00 */
  salarioMinimoCents: number;
  inss: {
    /** Empregado/doméstico/avulso — Portaria Interministerial MPS/MF 2026. [teto da faixa, alíquota %] */
    faixas: readonly (readonly [number, number])[];
    tetoCents: number;
    /** Contribuinte individual (autônomo) no plano normal. */
    autonomoPct: number;
    /** MEI e facultativo baixa renda: 5% do salário mínimo. */
    meiPct: number;
  };
  irMensal: {
    faixas: readonly FaixaIR[];
    dependenteCents: number;
    descontoSimplificadoCents: number;
    /** Lei 15.270/2025 (redutor mensal). */
    reducao: { isencaoAteCents: number; maxCents: number; faixaAteCents: number; aCents: number; b: number };
  };
  irAnual: {
    faixas: readonly FaixaIR[];
    dependenteCents: number;
    educacaoLimitePorPessoaCents: number;
    /** 20% dos rendimentos tributáveis, limitado a este valor. */
    descontoSimplificadoPct: number;
    descontoSimplificadoLimiteCents: number;
    /** PGBL: até 12% dos rendimentos tributáveis. */
    previdenciaPrivadaPct: number;
    /** Lei 15.270/2025, art. 11-A da Lei 9.250 (redutor anual). */
    reducao: { isencaoAteCents: number; maxCents: number; faixaAteCents: number; aCents: number; b: number };
    /** Rendimentos tributáveis acima deste valor obrigam a declarar. A confirmar na IN do exercício. */
    obrigatoriedadeCents: number;
    obrigatoriedadeConfirmada: boolean;
  };
  mei: {
    limiteAnualCents: number;
    /** Excesso de até 20%: continua MEI até dezembro e paga DAS complementar. */
    toleranciaPct: number;
    icmsCents: number;
    issCents: number;
  };
  cashback: {
    /** LC 214/2025, art. 123. */
    inicioCbs: string;
    inicioIbs: string;
    /** Art. 113: renda familiar per capita de até meio salário mínimo. */
    rendaPerCapitaMaxCents: number;
    /** Art. 118, I: botijão até 13 kg, energia, água, esgoto, gás canalizado, telecom. */
    essenciais: { cbsPct: number; ibsPct: number };
    /** Art. 118, II: demais bens e serviços. */
    demais: { cbsPct: number; ibsPct: number };
    /** Alíquota de referência da CBS — ESTIMATIVA até a resolução do Senado. */
    cbsAliquotaEstimadaPct: number;
    /** Alíquota de referência do IBS — ESTIMATIVA (o IBS pleno só vem em 2033). */
    ibsAliquotaEstimadaPct: number;
  };
}

const x12 = (c: number) => c * 12;

export const PARAMS_2026: ParametrosFiscais = {
  ano: 2026,
  salarioMinimoCents: 162_100,
  inss: {
    faixas: [
      [162_100, 7.5],
      [290_284, 9],
      [435_427, 12],
      [847_555, 14],
    ],
    tetoCents: 847_555,
    autonomoPct: 20,
    meiPct: 5,
  },
  irMensal: {
    // Tabela vigente desde maio/2025 (Lei 15.191/2025), sem alteração em 2026.
    faixas: [
      [242_880, 0, 0],
      [282_665, 7.5, 18_216],
      [375_105, 15, 39_416],
      [466_468, 22.5, 67_549],
      [Number.MAX_SAFE_INTEGER, 27.5, 90_873],
    ],
    dependenteCents: 18_959,
    descontoSimplificadoCents: 60_720,
    reducao: { isencaoAteCents: 500_000, maxCents: 31_289, faixaAteCents: 735_000, aCents: 97_862, b: 0.133145 },
  },
  irAnual: {
    // Tabela anual = mensal × 12 (exercício 2027, ano-calendário 2026).
    faixas: [
      [x12(242_880), 0, 0],
      [x12(282_665), 7.5, x12(18_216)],
      [x12(375_105), 15, x12(39_416)],
      [x12(466_468), 22.5, x12(67_549)],
      [Number.MAX_SAFE_INTEGER, 27.5, x12(90_873)],
    ],
    dependenteCents: 227_508,
    educacaoLimitePorPessoaCents: 356_150,
    descontoSimplificadoPct: 20,
    descontoSimplificadoLimiteCents: 1_764_000,
    previdenciaPrivadaPct: 12,
    reducao: { isencaoAteCents: 6_000_000, maxCents: 269_415, faixaAteCents: 8_820_000, aCents: 842_973, b: 0.095575 },
    obrigatoriedadeCents: 3_558_400,
    obrigatoriedadeConfirmada: false,
  },
  mei: {
    limiteAnualCents: 8_100_000,
    toleranciaPct: 20,
    icmsCents: 100,
    issCents: 500,
  },
  cashback: {
    inicioCbs: '2027-01',
    inicioIbs: '2029-01',
    rendaPerCapitaMaxCents: 81_050,
    essenciais: { cbsPct: 100, ibsPct: 20 },
    demais: { cbsPct: 20, ibsPct: 20 },
    cbsAliquotaEstimadaPct: 8.8,
    ibsAliquotaEstimadaPct: 17.7,
  },
};

/** Parâmetros do ano pedido. Anos sem tabela própria usam a mais recente (e o resultado avisa). */
export function parametros(ano: number): { params: ParametrosFiscais; exato: boolean } {
  return { params: PARAMS_2026, exato: ano === PARAMS_2026.ano };
}
