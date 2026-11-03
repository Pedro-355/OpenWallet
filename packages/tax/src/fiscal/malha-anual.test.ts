import { describe, expect, it } from 'vitest';
import { checarMalha, type ReciboMalha, type RendimentoMalha } from './malha.js';
import { impostometroAnual } from './anual.js';

const recibo = (o: Partial<ReciboMalha> = {}): ReciboMalha => ({
  id: 'r1', tipo: 'saude', valorCents: 20_000, documentoPrestador: '11222333000181', nomePrestador: 'Clínica', beneficiario: 'Titular', ...o,
});
const rend = (o: Partial<RendimentoMalha> = {}): RendimentoMalha => ({
  id: 'i1', tipo: 'salario', valorCents: 6_000_000, documentoPagador: '11222333000181', irRetidoCents: 0, mes: '2026-03', ...o,
});
const checar = (o: Partial<Parameters<typeof checarMalha>[0]> = {}) =>
  checarMalha({ recibos: [], rendimentos: [rend()], carneLeaoPago: [], dependentes: [], ...o });

describe('checagem de malha fina', () => {
  it('sem problemas devolve um aviso tranquilizador', () => {
    expect(checar()).toEqual([expect.objectContaining({ nivel: 'info', codigo: 'sem_alertas' })]);
  });

  it('despesa médica sem CPF/CNPJ é risco alto', () => {
    const a = checar({ recibos: [recibo({ id: 'x', documentoPrestador: null })] });

    expect(a[0]).toMatchObject({ nivel: 'alto', codigo: 'saude_sem_documento', itens: ['x'] });
  });

  it('despesa médica acima de 20% da renda pede atenção', () => {
    expect(checar({ recibos: [recibo({ valorCents: 2_000_000 })] }).map((x) => x.codigo)).toContain('saude_alta');
  });

  it('recibo repetido é apontado', () => {
    const a = checar({ recibos: [recibo({ id: 'a' }), recibo({ id: 'b', documentoPrestador: '11.222.333/0001-81' })] });

    expect(a.find((x) => x.codigo === 'recibo_duplicado')?.itens).toEqual(['a', 'b']);
  });

  it('recibo sem documento é comparado pelo nome do prestador', () => {
    const a = checar({ recibos: [recibo({ id: 'a', documentoPrestador: null, tipo: 'outro' }), recibo({ id: 'b', documentoPrestador: null, tipo: 'outro' })] });

    expect(a.map((x) => x.codigo)).toContain('recibo_duplicado');
  });

  it('salário sem CNPJ da empresa é risco alto', () => {
    expect(checar({ rendimentos: [rend({ documentoPagador: '123' })] })[0]!.codigo).toBe('rendimento_sem_fonte');
  });

  it('recebimento de pessoa física sem carnê-leão no mês', () => {
    const a = checar({
      rendimentos: [rend({ tipo: 'autonomo_pf', mes: '2026-02' }), rend({ tipo: 'aluguel', mes: '2026-03' })],
      carneLeaoPago: ['2026-03'],
    });

    expect(a.find((x) => x.codigo === 'carne_leao_pendente')?.itens).toEqual(['2026-02']);
  });

  it('dependente declarado por outra pessoa', () => {
    expect(checar({ dependentes: [{ nome: 'Ana', declaradoPorOutraPessoa: true }, { nome: 'Leo' }] })[0]).toMatchObject({ codigo: 'dependente_duplicado', itens: ['Ana'] });
  });

  it('educação sem CNPJ da escola', () => {
    expect(checar({ recibos: [recibo({ tipo: 'educacao', documentoPrestador: null })] }).map((x) => x.codigo)).toContain('educacao_sem_documento');
  });

  it('ordena do mais grave para o menos grave', () => {
    const a = checar({ recibos: [recibo({ tipo: 'educacao', documentoPrestador: null }), recibo({ id: 'z', documentoPrestador: null })] });

    expect(a.map((x) => x.nivel)).toEqual(['alto', 'medio']);
  });
});

describe('impostômetro anual', () => {
  it('soma as partes e traduz em dias de trabalho', () => {
    const r = impostometroAnual({ ano: 2026, rendaBrutaCents: 10_000_000, consumoCents: 1_500_000, irCents: 500_000, inssCents: 900_000, patrimonioCents: 100_000 });

    expect(r.totalCents).toBe(3_000_000);
    expect(r.pctDaRenda).toBe(30);
    expect(r.diasTrabalhados).toBe(110);
    expect(r.liberdadeEm).toBe('2026-04-21');
    expect(r.partes.map((p) => p.chave)).toEqual(['consumo', 'ir', 'inss', 'patrimonio']);
  });

  it('sem renda informada não calcula dias', () => {
    const r = impostometroAnual({ ano: 2024, rendaBrutaCents: 0, consumoCents: 100, irCents: 0, inssCents: 0, patrimonioCents: 0, outrosCents: 50 });

    expect(r).toMatchObject({ totalCents: 150, pctDaRenda: null, diasTrabalhados: null, liberdadeEm: null });
  });

  it('nunca passa de um ano inteiro e considera ano bissexto', () => {
    expect(impostometroAnual({ ano: 2028, rendaBrutaCents: 100, consumoCents: 500, irCents: 0, inssCents: 0, patrimonioCents: 0 }).diasTrabalhados).toBe(366);
  });
});
