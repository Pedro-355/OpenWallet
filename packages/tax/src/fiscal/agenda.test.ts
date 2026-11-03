import { describe, expect, it } from 'vitest';
import {
  addDias, avistaOuParcelado, diaUtil, diaUtilAnterior, feriadosNacionais, pascoa, proximoDiaUtil, ultimoDiaUtilDoMes, vencimentosRecorrentes,
} from './agenda.js';

describe('calendário', () => {
  it.each([
    [2024, '2024-03-31'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
  ])('Páscoa de %i é %s', (ano, data) => {
    expect(pascoa(ano)).toBe(data);
  });

  it('feriados móveis de 2026: Carnaval, Sexta-feira Santa e Corpus Christi', () => {
    const f = feriadosNacionais(2026);

    expect(['2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04', '2026-11-20'].every((d) => f.has(d))).toBe(true);
  });

  it.each([
    ['2026-11-03', true], // terça
    ['2026-11-07', false], // sábado
    ['2026-11-20', false], // Consciência Negra
  ])('%s é dia útil? %s', (d, ok) => {
    expect(diaUtil(d)).toBe(ok);
  });

  it('próximo e anterior dia útil', () => {
    expect(proximoDiaUtil('2026-11-20')).toBe('2026-11-23');
    expect(diaUtilAnterior('2026-11-22')).toBe('2026-11-19');
    expect(proximoDiaUtil('2026-11-03')).toBe('2026-11-03');
  });

  it('último dia útil do mês', () => {
    expect(ultimoDiaUtilDoMes(2027, 1)).toBe('2027-01-29');
  });

  it('addDias atravessa meses e anos', () => {
    expect(addDias('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('vencimentos recorrentes', () => {
  const todos = { mei: true, carneLeao: true, declaraIr: true };

  it('DAS do MEI no dia 20, antecipado quando cai em feriado', () => {
    const v = vencimentosRecorrentes({ mei: true, carneLeao: false, declaraIr: false }, '2026-11-01', '2026-11-30');

    expect(v).toEqual([expect.objectContaining({ tipo: 'das_mei', competencia: '2026-10', vencimento: '2026-11-19' })]);
  });

  it('carnê-leão no último dia útil do mês seguinte, com competência de dezembro virando o ano', () => {
    const v = vencimentosRecorrentes({ mei: false, carneLeao: true, declaraIr: false }, '2027-01-01', '2027-01-31');

    expect(v).toEqual([expect.objectContaining({ tipo: 'carne_leao', competencia: '2026-12', vencimento: '2027-01-29' })]);
  });

  it('em maio entram a DASN-SIMEI e a declaração do IR (data prevista)', () => {
    const v = vencimentosRecorrentes(todos, '2027-05-01', '2027-05-31');

    expect(v.map((x) => x.tipo)).toEqual(['das_mei', 'carne_leao', 'dasn_simei', 'dirpf']);
    expect(v.find((x) => x.tipo === 'dirpf')).toMatchObject({ previsto: true, vencimento: '2027-05-31' });
  });

  it('sem MEI, sem carnê-leão e sem IR não há nada na agenda', () => {
    expect(vencimentosRecorrentes({ mei: false, carneLeao: false, declaraIr: false }, '2027-01-01', '2027-12-31')).toEqual([]);
  });

  it('respeita o intervalo pedido', () => {
    const v = vencimentosRecorrentes(todos, '2026-11-25', '2026-12-05');

    expect(v.map((x) => x.vencimento)).toEqual(['2026-11-30']);
  });
});

describe('à vista ou parcelado', () => {
  it('desconto pequeno e dinheiro rendendo bem: parcelar compensa', () => {
    const r = avistaOuParcelado({ valorCents: 300_000, descontoAvistaPct: 3, parcelas: 10, rendimentoMensalPct: 1 });

    expect(r).toMatchObject({ avistaCents: 291_000, economiaAvistaCents: 9_000, recomendacao: 'parcelado' });
    expect(r.jurosImplicitoMensalPct).toBeCloseTo(0.68, 2);
  });

  it('desconto grande: pagar à vista compensa', () => {
    expect(avistaOuParcelado({ valorCents: 300_000, descontoAvistaPct: 10, parcelas: 3, rendimentoMensalPct: 1 }).recomendacao).toBe('avista');
  });

  it('sem desconto ou parcela única: tanto faz', () => {
    expect(avistaOuParcelado({ valorCents: 100_000, descontoAvistaPct: 0, parcelas: 5, rendimentoMensalPct: 0 }).recomendacao).toBe('tanto_faz');
    expect(avistaOuParcelado({ valorCents: 100_000, descontoAvistaPct: 5, parcelas: 1, rendimentoMensalPct: 0 }).jurosImplicitoMensalPct).toBe(0);
  });

  it('desconto fora de 0–100% é limitado', () => {
    expect(avistaOuParcelado({ valorCents: 100_000, descontoAvistaPct: 150, parcelas: 2, rendimentoMensalPct: 1 }).avistaCents).toBe(0);
    expect(avistaOuParcelado({ valorCents: -1, descontoAvistaPct: -5, parcelas: 0, rendimentoMensalPct: 1 }).avistaCents).toBe(0);
  });
});
