import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { impostoPelaTabela, inssAutonomo, inssEmpregado, irAnual, irMensal, type IRAnualInput } from './irpf.js';
import { PARAMS_2026, parametros } from './params.js';

const anual = (o: Partial<IRAnualInput> = {}): IRAnualInput => ({
  rendimentosTributaveisCents: 0,
  inssCents: 0,
  impostoPagoCents: 0,
  dependentes: 0,
  saudeCents: 0,
  educacaoPorPessoaCents: [],
  previdenciaPrivadaCents: 0,
  pensaoAlimenticiaCents: 0,
  ...o,
});

describe('INSS do empregado (tabela progressiva 2026)', () => {
  it.each([
    [0, 0],
    [162_100, 12_158], // salário mínimo: 7,5%
    [600_000, 64_151],
    [847_555, 98_809], // teto
    [2_000_000, 98_809], // acima do teto paga o máximo
  ])('salário de %i centavos → INSS de %i', (bruto, inss) => {
    expect(inssEmpregado(bruto)).toBe(inss);
  });

  it('nunca diminui quando o salário aumenta', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5_000_000 }), fc.integer({ min: 0, max: 100_000 }), (a, d) => {
        expect(inssEmpregado(a + d)).toBeGreaterThanOrEqual(inssEmpregado(a));
      }),
    );
  });
});

describe('INSS do autônomo', () => {
  it('cobra 20% sobre o que recebeu, até o teto', () => {
    expect(inssAutonomo(300_000)).toBe(60_000);
    expect(inssAutonomo(5_000_000)).toBe(169_511);
  });

  it('recolhe pelo menos sobre o salário mínimo', () => {
    expect(inssAutonomo(50_000)).toBe(32_420);
  });
});

describe('impostoPelaTabela', () => {
  it('base negativa é tratada como zero', () => {
    expect(impostoPelaTabela(-100, PARAMS_2026.irMensal.faixas)).toEqual({ impostoCents: 0, aliquotaPct: 0 });
  });

  it('tabela vazia não cobra nada', () => {
    expect(impostoPelaTabela(100_000, [])).toEqual({ impostoCents: 0, aliquotaPct: 0 });
  });
});

describe('IR mensal com o redutor da Lei 15.270/2025', () => {
  it('quem ganha até R$ 5.000 tem o imposto zerado', () => {
    const r = irMensal({ brutoCents: 500_000 });

    expect(r.impostoTabelaCents).toBeGreaterThan(0);
    expect(r.impostoCents).toBe(0);
    expect(r.reducaoLei15270Cents).toBe(r.impostoTabelaCents);
  });

  it('salário de R$ 6.000: tabela R$ 564,85 − redutor R$ 179,75 = R$ 385,10', () => {
    const r = irMensal({ brutoCents: 600_000 });

    expect(r.inssCents).toBe(64_151);
    expect(r.impostoTabelaCents).toBe(56_485);
    expect(r.reducaoLei15270Cents).toBe(17_975);
    expect(r.impostoCents).toBe(38_510);
    expect(r.liquidoCents).toBe(600_000 - 64_151 - 38_510);
  });

  it('acima de R$ 7.350 não há redutor', () => {
    expect(irMensal({ brutoCents: 1_000_000 }).reducaoLei15270Cents).toBe(0);
  });

  it('usa o desconto simplificado quando ele é maior que as deduções', () => {
    const r = irMensal({ brutoCents: 300_000, inssCents: 0 });

    expect(r.usouDescontoSimplificado).toBe(true);
    expect(r.baseCents).toBe(300_000 - 60_720);
  });

  it('dependentes e pensão diminuem a base', () => {
    const sem = irMensal({ brutoCents: 900_000 });
    const com = irMensal({ brutoCents: 900_000, dependentes: 2, pensaoAlimenticiaCents: 50_000 });

    expect(com.baseCents).toBe(sem.baseCents - 2 * 18_959 - 50_000);
  });

  it('autônomo calcula INSS de 20% e pode abater o livro-caixa', () => {
    const r = irMensal({ brutoCents: 800_000, tipo: 'autonomo', livroCaixaCents: 100_000 });

    expect(r.inssCents).toBe(160_000);
    expect(r.deducoesLegaisCents).toBe(260_000);
  });

  it('livro-caixa não vale para CLT', () => {
    expect(irMensal({ brutoCents: 800_000, livroCaixaCents: 100_000 }).deducoesLegaisCents).toBe(inssEmpregado(800_000));
  });

  it('renda zero dá alíquota efetiva zero', () => {
    expect(irMensal({ brutoCents: 0 }).aliquotaEfetivaPct).toBe(0);
  });

  it('o imposto nunca é negativo nem maior que a renda', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), fc.integer({ min: 0, max: 5 }), (bruto, dep) => {
        const r = irMensal({ brutoCents: bruto, dependentes: dep });
        expect(r.impostoCents).toBeGreaterThanOrEqual(0);
        expect(r.impostoCents).toBeLessThanOrEqual(bruto);
      }),
    );
  });
});

describe('IR anual (declaração de ajuste)', () => {
  it('até R$ 60 mil por ano não paga imposto (o redutor de R$ 2.694,15 zera a simplificada)', () => {
    const r = irAnual(anual({ rendimentosTributaveisCents: 6_000_000 }));

    expect(r.simplificada.impostoDevidoCents).toBe(0);
    expect(r.melhor).toBe('simplificada');
  });

  it('entre R$ 60 mil e R$ 88,2 mil o redutor diminui linearmente', () => {
    const r = irAnual(anual({ rendimentosTributaveisCents: 7_200_000 }));

    expect(r.simplificada.reducaoLei15270Cents).toBe(154_833);
  });

  it('acima de R$ 88,2 mil não tem redutor', () => {
    expect(irAnual(anual({ rendimentosTributaveisCents: 12_000_000 })).completa.reducaoLei15270Cents).toBe(0);
  });

  it('escolhe a completa quando as deduções passam do desconto simplificado', () => {
    const r = irAnual(
      anual({ rendimentosTributaveisCents: 7_200_000, inssCents: 700_000, dependentes: 1, saudeCents: 500_000, educacaoPorPessoaCents: [300_000] }),
    );

    expect(r.melhor).toBe('completa');
    expect(r.vantagemCents).toBe(r.simplificada.impostoDevidoCents - r.completa.impostoDevidoCents);
  });

  it('escolhe a simplificada quando quase não há deduções', () => {
    expect(irAnual(anual({ rendimentosTributaveisCents: 12_000_000 })).melhor).toBe('simplificada');
  });

  it('limita educação por pessoa, previdência privada a 12% e o desconto simplificado ao teto', () => {
    const r = irAnual(
      anual({ rendimentosTributaveisCents: 20_000_000, educacaoPorPessoaCents: [1_000_000, 100_000], previdenciaPrivadaCents: 5_000_000 }),
    );

    expect(r.limitesAplicados).toEqual(['educacao', 'previdencia_privada', 'desconto_simplificado']);
    expect(r.completa.deducoesCents).toBe(356_150 + 100_000 + 2_400_000);
    expect(r.simplificada.deducoesCents).toBe(1_764_000);
  });

  it('saldo positivo = restituição; negativo = imposto a pagar', () => {
    const restitui = irAnual(anual({ rendimentosTributaveisCents: 5_000_000, impostoPagoCents: 100_000 }));
    const paga = irAnual(anual({ rendimentosTributaveisCents: 12_000_000 }));

    expect(restitui.simplificada.saldoCents).toBe(100_000);
    expect(paga.simplificada.saldoCents).toBeLessThan(0);
  });

  it('indica obrigatoriedade de declarar (valor ainda a confirmar pela Receita)', () => {
    expect(irAnual(anual({ rendimentosTributaveisCents: 4_000_000 })).obrigadoADeclarar).toBe(true);
    expect(irAnual(anual({ rendimentosTributaveisCents: 3_000_000 })).obrigadoADeclarar).toBe(false);
    expect(irAnual(anual()).obrigatoriedadeConfirmada).toBe(false);
  });

  it('valores negativos informados por engano são ignorados', () => {
    const r = irAnual(anual({ rendimentosTributaveisCents: -1, inssCents: -5, dependentes: -2, saudeCents: -1, educacaoPorPessoaCents: [-10], pensaoAlimenticiaCents: -3, impostoPagoCents: -9 }));

    expect(r.completa.deducoesCents).toBe(0);
    expect(r.completa.saldoCents).toBe(0);
  });
});

describe('parametros', () => {
  it('ano com tabela própria é exato; outros usam a mais recente', () => {
    expect(parametros(2026).exato).toBe(true);
    expect(parametros(2027)).toEqual({ params: PARAMS_2026, exato: false });
  });
});
