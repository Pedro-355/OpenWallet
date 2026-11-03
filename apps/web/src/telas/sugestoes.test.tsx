import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemAgenda } from '../mvpApi';
import { criarMvpFalso } from '../test/mvpMock';

const falso = criarMvpFalso();
vi.mock('../mvpApi', () => ({ mvp: falso }));
const { montarSugestoes, Sugestoes } = await import('./Sugestoes');

const item = (o: Partial<ItemAgenda> = {}): ItemAgenda => ({
  id: null, origem: 'automatica', tipo: 'das_mei', titulo: 'DAS do MEI', vencimento: '2026-11-19', competencia: '2026-10',
  valorCents: 8_605, pago: false, previsto: false, dica: '', atrasado: false, descontoAvistaPct: null, parcelas: null, ...o,
});

describe('montarSugestoes', () => {
  const hoje = '2026-11-17';

  it.each([
    ['2026-11-17', 'DAS do MEI vence hoje'],
    ['2026-11-18', 'DAS do MEI vence amanhã'],
    ['2026-11-20', 'DAS do MEI vence em 3 dias'],
    ['2026-11-10', 'DAS do MEI já venceu'],
  ])('vencimento em %s → "%s"', (vencimento, titulo) => {
    const [s] = montarSugestoes({ agenda: [item({ vencimento })], perdidoSemCpfCents: null, perfilPreenchido: true }, hoje);

    expect(s).toMatchObject({ title: titulo, tag: 'Prazo', destino: 'agenda' });
    expect(s!.body).toBe('Que tal deixar pago agora? São R$ 86,05.');
  });

  it('ignora vencimentos pagos ou a mais de 7 dias, e convida mesmo sem valor', () => {
    const r = montarSugestoes(
      { agenda: [item({ pago: true }), item({ vencimento: '2026-12-30' }), item({ id: 'x', competencia: null, valorCents: null, titulo: 'IPTU', vencimento: '2026-11-20' })], perdidoSemCpfCents: null, perfilPreenchido: true },
      hoje,
    );

    expect(r).toHaveLength(1);
    expect(r[0]!.body).toMatch(/Que tal resolver agora/);
  });

  it('sugere CPF na nota quando há cashback perdido e o perfil quando está vazio, no máximo três', () => {
    const r = montarSugestoes({ agenda: [item()], perdidoSemCpfCents: 879, perfilPreenchido: false }, hoje);

    expect(r.map((s) => s.id)).toEqual(['agenda-das_mei-2026-10', 'cpf-na-nota', 'perfil']);
    expect(r[1]!.title).toBe('R$ 8,79 de cashback ficariam para trás');
    expect(r.every((s) => s.why.length > 0 && !/!/.test(s.title))).toBe(true);
  });

  it('valor perdido menor que R$ 1 não vira sugestão', () => {
    expect(montarSugestoes({ agenda: null, perdidoSemCpfCents: 50, perfilPreenchido: null }, hoje)).toEqual([]);
  });
});

describe('Sugestões na tela inicial', () => {
  beforeEach(() => {
    Object.values(falso).forEach((f) => f.mockReset());
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-17T15:00:00Z'));
    falso.agenda.mockResolvedValue({ itens: [item()], resumo: { atrasados: 0, proximos7dias: 1 } });
    falso.cashback.mockResolvedValue({ perfilPreenchido: false, estimativa: { perdidoSemCpfCents: 0 } });
  });

  it('o botão leva à aba certa', async () => {
    const irPara = vi.fn();
    render(<Sugestoes irPara={irPara} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Preencher perfil' }));

    expect(irPara).toHaveBeenCalledWith('ajuda');
    expect(screen.getByText(/A decisão é sempre sua/)).toBeInTheDocument();
  });

  it('"Agora não" esconde a sugestão até amanhã', async () => {
    const { unmount } = render(<Sugestoes irPara={vi.fn()} />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Agora não' }))[0]!);
    expect(screen.getByText('Tudo bem. A gente lembra você amanhã.')).toBeInTheDocument();
    unmount();

    render(<Sugestoes irPara={vi.fn()} />);

    await screen.findByText('Seu perfil ainda está vazio');
    expect(screen.queryByText('DAS do MEI vence em 2 dias')).not.toBeInTheDocument();
  });

  it('sem nada a sugerir, não mostra a seção; se a API falhar, também não', async () => {
    falso.agenda.mockRejectedValue(new Error('x'));
    falso.cashback.mockRejectedValue(new Error('x'));
    const { container } = render(<Sugestoes irPara={vi.fn()} />);

    await waitFor(() => expect(falso.cashback).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
