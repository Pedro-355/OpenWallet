import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Button, Chip, Iniciais, Money, OQueE, ProgressBar, SuggestionCard, Tag, Toggle, formatarReais } from './componentes';
import { Icone } from './Icone';
import { privacidade } from './privacidade';
import { BotaoOcultar } from '../telas/comum';

beforeEach(() => {
  privacidade.set(false);
});

describe('Money (regras de escrita de valores)', () => {
  it.each([
    [1284.5, false, 'R$ 1.284,50'],
    [120, true, '+R$ 120,00'],
    [-186.9, false, '−R$ 186,90'],
    [-186.9, true, '−R$ 186,90'],
    [0, true, 'R$ 0,00'],
  ])('%s (signed=%s) → %s', (valor, signed, texto) => {
    expect(formatarReais(valor, signed)).toBe(texto);
  });

  it('usa o sinal U+2212, não o hífen', () => {
    expect(formatarReais(-1).charCodeAt(0)).toBe(0x2212);
  });

  it('com signed, colore pelo sinal; sem signed, fica neutro', () => {
    const { rerender } = render(<Money value={10} signed />);
    expect(screen.getByText('+R$ 10,00')).toHaveClass('ow-money--positive');

    rerender(<Money value={-10} signed />);
    expect(screen.getByText('−R$ 10,00')).toHaveClass('ow-money--negative');

    rerender(<Money value={-10} />);
    expect(screen.getByText('−R$ 10,00')).toHaveClass('ow-money--neutral');
  });

  it('aceita centavos e o formato compacto', () => {
    render(
      <>
        <Money cents={12_345} size="lg" />
        <Money cents={18_449} compact />
      </>,
    );

    expect(screen.getByText('R$ 123,45')).toHaveClass('ow-money--lg');
    expect(screen.getByText('R$ 184')).toBeInTheDocument();
  });

  it('o botão de olho oculta todos os valores e lembra a escolha', async () => {
    render(
      <>
        <BotaoOcultar />
        <Money value={50} />
        <Money value={50} hidden={false} />
      </>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar valores' }));

    expect(screen.getByText('R$ ••••')).toBeInTheDocument();
    expect(screen.getByText('R$ 50,00')).toBeInTheDocument(); // hidden={false} sempre mostra
    expect(localStorage.getItem('openwallet.ocultar-valores')).toBe('1');
    expect(screen.getByRole('button', { name: 'Mostrar valores' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('lê a preferência salva e sobrevive sem localStorage', () => {
    localStorage.setItem('openwallet.ocultar-valores', '1');
    privacidade._recarregar();
    expect(privacidade.get()).toBe(true);

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    privacidade._recarregar();
    expect(privacidade.get()).toBe(false);
    act(() => privacidade.set(true));
    expect(privacidade.get()).toBe(true);
  });
});

describe('Button, Chip, Tag, Toggle', () => {
  it('Button aplica variante, tamanho e largura total', () => {
    render(
      <Button variant="ink" size="lg" block>
        Pagar fatura
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Pagar fatura' })).toHaveClass('ow-btn', 'ow-btn--ink', 'ow-btn--lg', 'ow-btn--block');
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('Button primary é o padrão', () => {
    render(<Button>Continuar</Button>);
    expect(screen.getByRole('button')).toHaveClass('ow-btn--primary', 'ow-btn--md');
  });

  it('Chip marca aria-pressed', () => {
    render(
      <>
        <Chip selected>Todos</Chip>
        <Chip>Saúde</Chip>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Saúde' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('Tag usa o tom pedido', () => {
    render(<Tag tone="attention">Prazo</Tag>);
    expect(screen.getByText('Prazo')).toHaveClass('ow-tag--attention');
  });

  it('Toggle é um switch com nome e avisa a mudança', async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Notificações" />);

    await userEvent.click(screen.getByRole('switch', { name: 'Notificações' }));

    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });
});

describe('ProgressBar', () => {
  it('barra contínua limita o valor entre 0 e 100', () => {
    render(<ProgressBar value={140} label="Meta" tone="attention" />);
    const barra = screen.getByRole('progressbar', { name: 'Meta' });

    expect(barra).toHaveAttribute('aria-valuenow', '100');
    expect(barra).toHaveClass('ow-progress--attention');
  });

  it('em segmentos, acende a proporção certa', () => {
    const { container } = render(<ProgressBar value={60} segments={5} label="Trilha" />);

    expect(container.querySelectorAll('.ow-seg.is-done')).toHaveLength(3);
  });
});

describe('SuggestionCard', () => {
  it('mostra o porquê, conclui e desfaz', async () => {
    const onStatusChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SuggestionCard tag="Prazo" tone="attention" title="DAS vence em 2 dias" why="Vimos na sua agenda." cta="Ver agenda" doneText="Combinado!" onStatusChange={onStatusChange}>
        Que tal deixar pago?
      </SuggestionCard>,
    );

    await user.click(screen.getByRole('button', { name: 'Por que essa sugestão?' }));
    expect(screen.getByText('Vimos na sua agenda.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ver agenda' }));
    expect(screen.getByText('Combinado!')).toBeInTheDocument();
    expect(onStatusChange).toHaveBeenLastCalledWith('done');

    await user.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(onStatusChange).toHaveBeenLastCalledWith('pending');
  });

  it('"Agora não" nunca pune', async () => {
    render(<SuggestionCard tag="Economia" title="Título" />);

    await userEvent.click(screen.getByRole('button', { name: 'Agora não' }));

    expect(screen.getByText('Tudo bem. A gente lembra você amanhã.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Por que essa sugestão?' })).not.toBeInTheDocument();
  });

  it('sem cta e sem doneText usa os textos padrão', async () => {
    render(<SuggestionCard tag="X" title="T" />);
    await userEvent.click(screen.getByRole('button', { name: 'Fazer agora' }));
    expect(screen.getByText('Feito!')).toBeInTheDocument();
  });
});

describe('OQueE, Iniciais e Icone', () => {
  it('a nota explicativa abre e fecha', async () => {
    render(<OQueE termo="DAS">Guia mensal do MEI.</OQueE>);
    const botao = screen.getByRole('button', { name: 'O que é isso? DAS' });

    await userEvent.click(botao);
    expect(screen.getByText('Guia mensal do MEI.')).toBeInTheDocument();
    await userEvent.click(botao);
    expect(screen.queryByText('Guia mensal do MEI.')).not.toBeInTheDocument();
  });

  it.each([
    ['Nubank', 'NU'],
    ['Caixa Econômica Federal', 'CE'],
    ['SUPERMERCADO EXEMPLO LTDA', 'SE'],
    ['Escritório Exemplo (fictício)', 'EE'],
    ['NU', 'NU'],
  ])('iniciais de "%s" são %s', (nome, ini) => {
    const { container } = render(<Iniciais nome={nome} />);
    expect(container.textContent).toBe(ini);
  });

  it('ícone decorativo fica escondido do leitor de tela; com título, vira imagem', () => {
    const { container, rerender } = render(<Icone nome="olho" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('svg')).toHaveAttribute('stroke-width', '1.8');

    rerender(<Icone nome="olho" titulo="Ver" />);
    expect(screen.getByRole('img', { name: 'Ver' })).toBeInTheDocument();
  });
});
