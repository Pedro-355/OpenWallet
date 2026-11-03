import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { elegibilidadeCashback, estimarCashback, type GastoCashback } from './cashback.js';

const gasto = (o: Partial<GastoCashback> = {}): GastoCashback => ({
  categoria: 'outros',
  valorCents: 10_000,
  data: '2027-03-10',
  cpfNaNota: true,
  ...o,
});

describe('quem tem direito ao cashback', () => {
  it('família no CadÚnico com até meio salário mínimo por pessoa', () => {
    const r = elegibilidadeCashback({ inscritoCadUnico: true, pessoasNaFamilia: 4, rendaFamiliarMensalCents: 300_000 });

    expect(r).toMatchObject({ elegivel: true, rendaPerCapitaCents: 75_000, motivos: [] });
  });

  it('fora do CadÚnico não tem direito', () => {
    const r = elegibilidadeCashback({ inscritoCadUnico: false, pessoasNaFamilia: 4, rendaFamiliarMensalCents: 100_000 });

    expect(r.elegivel).toBe(false);
    expect(r.motivos[0]).toMatch(/CadÚnico/);
  });

  it('renda por pessoa acima do limite não tem direito', () => {
    const r = elegibilidadeCashback({ inscritoCadUnico: true, pessoasNaFamilia: 1, rendaFamiliarMensalCents: 162_100 });

    expect(r.elegivel).toBe(false);
    expect(r.motivos[0]).toMatch(/meio salário/);
  });

  it('família com 0 pessoas informadas conta como 1', () => {
    expect(elegibilidadeCashback({ inscritoCadUnico: true, pessoasNaFamilia: 0, rendaFamiliarMensalCents: 50_000 }).rendaPerCapitaCents).toBe(50_000);
  });
});

describe('estimativa do cashback', () => {
  it('contas da casa devolvem 100% da CBS; demais compras, 20%', () => {
    const conta = estimarCashback([gasto({ categoria: 'moradia', valorCents: 10_880 })]);
    const outra = estimarCashback([gasto({ categoria: 'outros', valorCents: 10_880 })]);

    // 10.880 com CBS estimada de 8,8% por dentro → 880 de CBS
    expect(conta.potencialCents).toBe(880);
    expect(outra.potencialCents).toBe(176);
  });

  it('compra sem CPF na nota entra como dinheiro perdido', () => {
    const r = estimarCashback([gasto({ cpfNaNota: false }), gasto({ cpfNaNota: null })]);

    expect(r.totalComCpfCents).toBe(0);
    expect(r.perdidoSemCpfCents).toBe(r.potencialCents);
  });

  it('contas da casa contam como com CPF (a devolução vem na própria conta)', () => {
    expect(estimarCashback([gasto({ categoria: 'moradia', cpfNaNota: null })]).perdidoSemCpfCents).toBe(0);
  });

  it('mercado conta só em parte (cesta básica tem alíquota zero)', () => {
    const mercado = estimarCashback([gasto({ categoria: 'mercado' })]).potencialCents;
    const outros = estimarCashback([gasto({ categoria: 'outros' })]).potencialCents;

    expect(mercado).toBeLessThan(outros);
  });

  it('antes de 2027 é simulação; a partir de 2027 está vigente', () => {
    expect(estimarCashback([gasto({ data: '2026-11-01' })]).vigente).toBe(false);
    expect(estimarCashback([gasto({ data: '2027-01-01' })]).vigente).toBe(true);
  });

  it('o IBS só entra na devolução a partir de 2029', () => {
    const em2028 = estimarCashback([gasto({ data: '2028-06-01' })]).potencialCents;
    const em2029 = estimarCashback([gasto({ data: '2029-06-01' })]).potencialCents;

    expect(em2029).toBeGreaterThan(em2028);
  });

  it('agrupa por categoria, maior devolução primeiro', () => {
    const r = estimarCashback([gasto({ categoria: 'outros' }), gasto({ categoria: 'moradia' }), gasto({ categoria: 'outros' })]);

    expect(r.porCategoria.map((c) => c.categoria)).toEqual(['moradia', 'outros']);
    expect(r.porCategoria[1]).toMatchObject({ gastoCents: 20_000, essencial: false });
  });

  it('a devolução nunca passa do valor gasto', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), fc.constantFrom('moradia', 'mercado', 'outros'), (v, categoria) => {
        const r = estimarCashback([gasto({ valorCents: v, categoria, data: '2030-01-01' })]);
        expect(r.potencialCents).toBeLessThanOrEqual(v);
        expect(r.potencialCents).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});
