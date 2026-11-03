import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseForm } from './ExpenseForm';
import { aRatesTable } from './test/factories';

const createExpense = vi.fn();
vi.mock('./api', async (importOriginal) => {
  const real = await importOriginal<typeof import('./api')>();
  return { ...real, api: { ...real.api, createExpense: (...args: unknown[]) => createExpense(...args) } };
});

function setup() {
  const onSaved = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<ExpenseForm rates={aRatesTable()} defaultUf="SP" month="2026-10" onSaved={onSaved} />);
  return { user, onSaved, valor: screen.getByLabelText(/valor/i), categoria: screen.getByLabelText(/categoria/i) };
}

describe('ExpenseForm', () => {
  beforeEach(() => {
    createExpense.mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T15:00:00Z'));
  });

  it('mostra a prévia do imposto enquanto a pessoa digita', async () => {
    const { user, valor, categoria } = setup();
    expect(screen.getByText(/digite um valor/i)).toBeInTheDocument();

    await user.type(valor, '100');
    await user.selectOptions(categoria, 'mercado');

    // Mercado em SP: 10% federal + 18% ICMS = 28%
    expect(screen.getByText('R$ 28,00', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/28%/)).toBeInTheDocument();
  });

  it('a prévia muda com a UF da compra', async () => {
    const { user, valor, categoria } = setup();
    await user.type(valor, '100');
    await user.selectOptions(categoria, 'mercado');
    await user.selectOptions(screen.getByLabelText(/uf da compra/i), 'BA'); // ICMS padrão 12%
    expect(screen.getByText(/22%/)).toBeInTheDocument();
  });

  it('salva com os dados certos e limpa o formulário', async () => {
    createExpense.mockResolvedValue({ expense: {} });
    const { user, valor, categoria, onSaved } = setup();

    await user.type(valor, '45,90');
    await user.selectOptions(categoria, 'combustivel');
    await user.type(screen.getByLabelText(/descrição/i), 'Posto');
    await user.click(screen.getByRole('button', { name: /adicionar gasto/i }));

    expect(createExpense).toHaveBeenCalledWith(
      { amountCents: 4590, category: 'combustivel', description: 'Posto', uf: 'SP', spentOn: '2026-10-20' },
      expect.any(String),
    );
    expect(onSaved).toHaveBeenCalled();
    expect(valor).toHaveValue('');
  });

  it('se a rede falhar, o reenvio usa a MESMA chave (não duplica); depois de salvar, troca a chave', async () => {
    createExpense.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue({ expense: {} });
    const { user, valor } = setup();
    const salvar = () => user.click(screen.getByRole('button', { name: /adicionar gasto/i }));

    await user.type(valor, '10');
    await salvar();
    expect(await screen.findByText(/não vai duplicar/i)).toBeInTheDocument();
    await salvar();
    await user.type(valor, '20');
    await salvar();

    const keys = createExpense.mock.calls.map((c) => c[1]);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it('valor inválido não chama a API', async () => {
    const { user, valor } = setup();
    await user.type(valor, 'abc');
    await user.click(screen.getByRole('button', { name: /adicionar gasto/i }));
    expect(screen.getByText(/informe um valor válido/i)).toBeInTheDocument();
    expect(createExpense).not.toHaveBeenCalled();
  });

  it('vendo um mês passado, a data sugerida é o último dia daquele mês', () => {
    render(<ExpenseForm rates={aRatesTable()} defaultUf="SP" month="2026-09" onSaved={vi.fn()} />);
    expect(screen.getByLabelText(/data/i)).toHaveValue('2026-09-30');
  });
});
