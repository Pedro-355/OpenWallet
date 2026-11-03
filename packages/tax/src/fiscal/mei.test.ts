import { describe, expect, it } from 'vitest';
import { aliquotaEfetivaSimples, compararRegimes, dasMei, statusLimiteMei } from './mei.js';

describe('DAS do MEI 2026', () => {
  it.each([
    ['comercio', 8_205],
    ['servicos', 8_605],
    ['comercio_servicos', 8_705],
  ] as const)('%s paga %i centavos por mês', (atividade, total) => {
    expect(dasMei(atividade).totalCents).toBe(total);
  });

  it('o INSS do DAS é 5% do salário mínimo', () => {
    expect(dasMei('servicos').inssCents).toBe(8_105);
  });
});

describe('limite de faturamento do MEI', () => {
  const status = (faturado: number, o: { mesAtual?: number; abertura?: string | null } = {}) =>
    statusLimiteMei({ faturadoNoAnoCents: faturado, ano: 2026, mesAtual: o.mesAtual ?? 11, abertura: o.abertura });

  it.each([
    [3_000_000, 'ok'],
    [6_000_000, 'atencao'],
    [7_500_000, 'alerta'],
    [9_000_000, 'excedido_tolerancia'],
    [9_800_000, 'desenquadrado'],
  ] as const)('faturou %i centavos → %s', (faturado, nivel) => {
    expect(status(faturado).nivel).toBe(nivel);
  });

  it('no ano da abertura o limite é proporcional aos meses (contando o mês de abertura)', () => {
    const s = status(1_000_000, { abertura: '2026-09-15' });

    expect(s.mesesNoAno).toBe(4);
    expect(s.limiteCents).toBe(2_700_000);
  });

  it('abertura em ano anterior usa o limite cheio', () => {
    expect(status(0, { abertura: '2020-03-01' }).limiteCents).toBe(8_100_000);
  });

  it('abertura no futuro não tem limite disponível', () => {
    const s = status(0, { abertura: '2027-01-01' });

    expect(s.limiteCents).toBe(0);
    expect(s.usadoPct).toBe(0);
  });

  it('mostra quanto ainda cabe por mês até dezembro', () => {
    expect(status(4_100_000, { mesAtual: 11 }).mediaMensalDisponivelCents).toBe(2_000_000);
    expect(status(0, { mesAtual: 12 }).mediaMensalDisponivelCents).toBe(8_100_000);
  });

  it('faturamento negativo é tratado como zero', () => {
    expect(status(-5).faturadoCents).toBe(0);
  });
});

describe('alíquota efetiva do Simples Nacional', () => {
  it('na primeira faixa é a alíquota nominal', () => {
    expect(aliquotaEfetivaSimples(10_000_000, 'III')).toBe(6);
    expect(aliquotaEfetivaSimples(0, 'I')).toBe(4);
  });

  it('na segunda faixa desconta a parcela a deduzir', () => {
    // (300.000 × 11,2% − 9.360) ÷ 300.000 = 8,08%
    expect(aliquotaEfetivaSimples(30_000_000, 'III')).toBe(8.08);
  });

  it('acima de R$ 4,8 milhões está fora do Simples', () => {
    expect(aliquotaEfetivaSimples(500_000_000, 'V')).toBeNull();
  });
});

describe('comparador de regimes', () => {
  it('serviços com R$ 70 mil por ano: MEI é o mais barato, depois Simples III, V e autônomo', () => {
    const r = compararRegimes({ faturamentoAnualCents: 7_000_000, atividade: 'servicos' });

    expect(r.map((o) => o.regime)).toEqual(['mei', 'simples_anexo_iii', 'simples_anexo_v', 'autonomo_pf']);
    expect(r[0]).toMatchObject({ permitido: true, impostoAnualCents: 103_260 });
  });

  it('acima de R$ 81 mil o MEI aparece como não permitido, no fim da lista', () => {
    const r = compararRegimes({ faturamentoAnualCents: 15_000_000, atividade: 'servicos' });

    expect(r.at(-1)).toMatchObject({ regime: 'mei', permitido: false });
  });

  it('comércio compara MEI com o Anexo I', () => {
    const r = compararRegimes({ faturamentoAnualCents: 5_000_000, atividade: 'comercio' });

    expect(r.map((o) => o.regime)).toEqual(['mei', 'simples_anexo_i']);
  });

  it('acima do limite do Simples, as opções do Simples não são permitidas', () => {
    const r = compararRegimes({ faturamentoAnualCents: 600_000_000, atividade: 'comercio' });

    expect(r.every((o) => !o.permitido)).toBe(true);
  });

  it('faturamento zero não divide por zero', () => {
    expect(compararRegimes({ faturamentoAnualCents: 0, atividade: 'servicos' }).every((o) => o.cargaPct === 0)).toBe(true);
  });
});
