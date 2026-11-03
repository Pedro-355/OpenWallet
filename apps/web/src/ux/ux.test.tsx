import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Folha, useFolha } from './Folha';
import { Avisos, avisos, comDesfazer, vibrar } from './avisos';
import { CampoDinheiro, CampoDocumento, Segmentos, _limparSegmentos, formatarDinheiroDigitado, limparDinheiro, mascararDocumento, useSegmento } from './campos';
import { AvisoConexao, Esqueleto, LinhaTocavel, useAoVoltarParaApp, useListaCurta } from './estrutura';
import { useAbas } from '../telas/Navegacao';

beforeEach(() => {
  avisos._limpar();
  _limparSegmentos();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  vi.useRealTimers();
});

function ComFolha({ onFechar = () => {} }: { onFechar?: () => void }) {
  const f = useFolha();
  return (
    <>
      <button onClick={() => f.abrir()}>Abrir</button>
      <Folha
        aberta={f.aberta}
        onFechar={() => {
          f.fechar();
          onFechar();
        }}
        titulo="Novo gasto"
        descricao="Apoio"
        rodape={<button>Rodapé</button>}
      >
        <input aria-label="Valor" />
        <button>Salvar</button>
      </Folha>
    </>
  );
}

describe('Folha inferior', () => {
  it('abre com título, foca o primeiro campo e trava a rolagem de trás', async () => {
    render(<ComFolha />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));

    const folha = screen.getByRole('dialog', { name: 'Novo gasto' });
    expect(folha).toHaveAttribute('aria-modal', 'true');
    expect(folha).toHaveAccessibleDescription('Apoio');
    expect(screen.getByLabelText('Valor')).toHaveFocus();
    expect(document.body).toHaveClass('com-folha');
  });

  it('fecha pelo botão, com Esc e tocando fora, e devolve o foco', async () => {
    const onFechar = vi.fn();
    render(<ComFolha onFechar={onFechar} />);
    const abrir = screen.getByRole('button', { name: 'Abrir' });

    await userEvent.click(abrir);
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(abrir).toHaveFocus();
    expect(document.body).not.toHaveClass('com-folha');

    await userEvent.click(abrir);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(abrir);
    fireEvent.click(document.querySelector('.folha-fundo')!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onFechar).toHaveBeenCalledTimes(3);
  });

  it('o Voltar do celular fecha a folha em vez de sair da tela', async () => {
    render(<ComFolha />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(window.history.state?.folha).toBeTruthy();

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('prende o foco dentro da folha (Tab e Shift+Tab dão a volta)', async () => {
    render(<ComFolha />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    screen.getByRole('button', { name: 'Rodapé' }).focus();

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Rodapé' })).toHaveFocus();
  });

  it('arrastar a alça para baixo fecha; arrasto curto volta ao lugar', async () => {
    render(<ComFolha />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    const alca = document.querySelector('.folha-alca')!;

    fireEvent.pointerDown(alca, { clientY: 100 });
    fireEvent.pointerMove(alca, { clientY: 140 });
    expect(screen.getByRole('dialog').style.transform).toBe('translateY(40px)');
    fireEvent.pointerUp(alca);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.pointerDown(alca, { clientY: 100 });
    fireEvent.pointerMove(alca, { clientY: 260 });
    fireEvent.pointerUp(alca);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Avisos rápidos', () => {
  it('mostra, vibra e some sozinho', () => {
    vi.useFakeTimers();
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    render(<Avisos />);

    act(() => {
      avisos.mostrar('Gasto adicionado.');
    });
    expect(screen.getByText('Gasto adicionado.')).toBeInTheDocument();
    expect(vibrate).toHaveBeenCalledWith(12);

    act(() => {
      vi.advanceTimersByTime(3_600);
    });
    expect(screen.queryByText('Gasto adicionado.')).not.toBeInTheDocument();
  });

  it('erro vibra diferente e mantém no máximo dois avisos', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    render(<Avisos />);

    act(() => {
      avisos.mostrar('um');
      avisos.mostrar('dois');
      avisos.mostrar('três', { tom: 'erro' });
    });

    expect(screen.queryByText('um')).not.toBeInTheDocument();
    expect(screen.getByText('três').parentElement).toHaveClass('aviso-rapido--erro');
    expect(vibrate).toHaveBeenLastCalledWith([30, 40, 30]);
  });

  it('não vibra para quem pediu menos movimento, nem quebra sem vibração', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    vibrar();
    expect(vibrate).not.toHaveBeenCalled();

    vi.stubGlobal('matchMedia', () => {
      throw new Error('sem suporte');
    });
    expect(() => vibrar()).not.toThrow();
  });

  it('comDesfazer só executa depois da espera, e "Desfazer" cancela', async () => {
    vi.useFakeTimers();
    render(<Avisos />);
    const executar = vi.fn().mockResolvedValue(undefined);
    const aoAgendar = vi.fn();
    const aoDesfazer = vi.fn();

    act(() => comDesfazer({ texto: 'Apagado.', executar, aoAgendar, aoDesfazer }));
    expect(aoAgendar).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    act(() => {
      vi.advanceTimersByTime(6_000);
    });

    expect(aoDesfazer).toHaveBeenCalled();
    expect(executar).not.toHaveBeenCalled();

    act(() => comDesfazer({ texto: 'Apagado de novo.', executar, aoAgendar, aoDesfazer }));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(executar).toHaveBeenCalledTimes(1);
  });

  it('se a ação falhar depois da espera, o item volta e a pessoa é avisada', async () => {
    vi.useFakeTimers();
    render(<Avisos />);
    const aoDesfazer = vi.fn();
    const aoFalhar = vi.fn();

    act(() => comDesfazer({ texto: 'Apagado.', executar: () => Promise.reject(new Error('x')), aoAgendar: () => {}, aoDesfazer, aoFalhar, esperaMs: 100 }));
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(aoDesfazer).toHaveBeenCalled();
    expect(aoFalhar).toHaveBeenCalled();
    expect(screen.getByText('Não deu certo. Tente de novo.')).toBeInTheDocument();
  });
});

describe('Campos para o teclado do celular', () => {
  it.each([
    ['1234,5', '1.234,50'],
    ['90.000', '90.000,00'],
    ['', ''],
    ['x', 'x'],
  ])('formata "%s" como "%s" ao sair do campo', (entrada, saida) => {
    expect(formatarDinheiroDigitado(entrada)).toBe(saida);
  });

  it('o campo de dinheiro aceita só números, vírgula e ponto', () => {
    expect(limparDinheiro('R$ 1a2,3b')).toBe('12,3');
  });

  it.each([
    ['529', '529'],
    ['5299822', '529.982.2'],
    ['52998224725', '529.982.247-25'],
    ['112223330001', '11.222.333/0001'],
    ['11222333000181', '11.222.333/0001-81'],
    ['11222333000181999', '11.222.333/0001-81'],
  ])('máscara de documento: %s → %s', (d, m) => {
    expect(mascararDocumento(d)).toBe(m);
  });

  function Campos() {
    const [v, setV] = useState('');
    const [d, setD] = useState('');
    return (
      <>
        <CampoDinheiro rotulo="Valor" value={v} onChange={setV} dica="Dica do valor" />
        <CampoDocumento rotulo="Documento" value={d} onChange={setD} erro="CPF inválido" />
      </>
    );
  }

  it('teclado decimal com R$ fixo; documento com teclado numérico e erro anunciado', async () => {
    render(<Campos />);
    const valor = screen.getByLabelText('Valor');
    const doc = screen.getByLabelText('Documento');

    expect(valor).toHaveAttribute('inputmode', 'decimal');
    expect(valor).toHaveAccessibleDescription('Dica do valor');
    expect(doc).toHaveAttribute('inputmode', 'numeric');
    expect(doc).toHaveAttribute('aria-invalid', 'true');
    expect(doc).toHaveAccessibleDescription('CPF inválido');

    await userEvent.type(doc, '52998224725');
    expect(doc).toHaveValue('529.982.247-25');
  });

  it('segmentos mostram o selecionado e lembram a escolha da tela', async () => {
    function Tela() {
      const [p, setP] = useSegmento<'a' | 'b'>('tela-x', 'a');
      return <Segmentos rotulo="Partes" atual={p} onTrocar={setP} opcoes={[{ id: 'a', rotulo: 'A' }, { id: 'b', rotulo: 'B', contador: 2 }]} />;
    }
    const { unmount } = render(<Tela />);
    await userEvent.click(screen.getByRole('tab', { name: /B/ }));
    expect(screen.getByRole('tab', { name: /B/ })).toHaveAttribute('aria-selected', 'true');
    unmount();

    render(<Tela />);
    expect(screen.getByRole('tab', { name: /B/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /B/ })).toHaveTextContent('2');
  });
});

describe('Estrutura', () => {
  it('aviso de sem internet aparece e some com a conexão', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<AvisoConexao />);
    expect(screen.getByRole('status')).toHaveTextContent('Sem internet');

    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('recarrega ao voltar para o app e quando a internet volta', () => {
    const fn = vi.fn();
    renderHook(() => useAoVoltarParaApp(fn));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');

    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('esqueleto anuncia carregamento; linha tocável tem nome e abre o detalhe', async () => {
    const abrir = vi.fn();
    render(
      <>
        <Esqueleto destaque linhas={2} />
        <ul>
          <LinhaTocavel rotulo="Almoço, Hoje" onClick={abrir}>
            <span>Almoço</span>
          </LinhaTocavel>
        </ul>
      </>,
    );

    expect(screen.getByLabelText('Carregando')).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Almoço, Hoje' }));
    expect(abrir).toHaveBeenCalled();
  });

  it('lista curta mostra os primeiros e "ver todos" mostra o resto', () => {
    const { result } = renderHook(() => useListaCurta([1, 2, 3, 4, 5, 6, 7], 5));
    expect(result.current.visiveis).toHaveLength(5);
    expect(result.current.restante).toBe(2);

    act(() => result.current.verTodos());
    expect(result.current.visiveis).toHaveLength(7);
  });
});

describe('Navegação por abas', () => {
  it('cada troca entra no histórico, o Voltar volta para a aba anterior e a rolagem é lembrada', async () => {
    const rolar = vi.fn();
    vi.stubGlobal('scrollTo', rolar);
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => {
      f(0);
      return 0;
    });
    const { result } = renderHook(() => useAbas());
    expect(result.current[0]).toBe('inicio');

    Object.defineProperty(window, 'scrollY', { value: 640, configurable: true });
    act(() => result.current[1]('ir'));
    expect(result.current[0]).toBe('ir');
    expect(window.location.hash).toBe('#ir');

    window.history.replaceState(null, '', '/');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });
    expect(result.current[0]).toBe('inicio');
    await waitFor(() => expect(rolar).toHaveBeenLastCalledWith({ top: 640 }));
  });

  it('tocar na aba atual leva ao topo; popstate de folha é ignorado', () => {
    const rolar = vi.fn();
    vi.stubGlobal('scrollTo', rolar);
    window.history.replaceState(null, '', '/#agenda');
    const { result } = renderHook(() => useAbas());
    expect(result.current[0]).toBe('agenda');

    act(() => result.current[1]('agenda'));
    expect(rolar).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { folha: 'x' } }));
    });
    expect(result.current[0]).toBe('agenda');
  });
});
