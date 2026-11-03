/**
 * Folha inferior (bottom sheet): formulários e detalhes abrem de baixo, perto do polegar,
 * sem tirar a pessoa da tela em que estava.
 *
 * - Fecha pelo botão "Fechar", tocando fora, arrastando a alça para baixo, com Esc
 *   e com o botão Voltar do Android (cada folha aberta ocupa uma entrada no histórico).
 * - Prende o foco dentro dela e devolve o foco para quem abriu ao fechar.
 * - Trava a rolagem da página de trás.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icone } from '../ds/Icone';

const FOCAVEIS = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let abertas = 0;

export interface FolhaProps {
  aberta: boolean;
  onFechar: () => void;
  titulo: string;
  /** Linha de apoio abaixo do título. */
  descricao?: string;
  children: ReactNode;
  /** Ação fixa no pé da folha (ex.: botão de salvar). */
  rodape?: ReactNode;
}

export function Folha({ aberta, onFechar, titulo, descricao, children, rodape }: FolhaProps) {
  const id = useId();
  const painel = useRef<HTMLDivElement>(null);
  const fechar = useRef(onFechar);
  fechar.current = onFechar;
  const [arrasto, setArrasto] = useState(0);
  const inicioArrasto = useRef<number | null>(null);

  useEffect(() => {
    if (!aberta) return;
    const anterior = document.activeElement as HTMLElement | null;
    abertas++;
    document.body.classList.add('com-folha');

    // Voltar do Android/navegador fecha a folha em vez de sair da tela.
    let fechadaPeloVoltar = false;
    window.history.pushState({ ...(window.history.state ?? {}), folha: id }, '');
    const aoVoltar = () => {
      fechadaPeloVoltar = true;
      fechar.current();
    };
    window.addEventListener('popstate', aoVoltar);

    // Foco no primeiro campo (ou no próprio painel).
    const primeiro = painel.current?.querySelector<HTMLElement>('input, select, textarea') ?? painel.current;
    primeiro?.focus({ preventScroll: true });

    return () => {
      window.removeEventListener('popstate', aoVoltar);
      abertas--;
      if (abertas === 0) document.body.classList.remove('com-folha');
      if (!fechadaPeloVoltar && window.history.state?.folha === id) window.history.back();
      anterior?.focus?.({ preventScroll: true });
    };
  }, [aberta, id]);

  if (!aberta) return null;

  function teclado(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onFechar();
      return;
    }
    if (e.key !== 'Tab' || !painel.current) return;
    const itens = [...painel.current.querySelectorAll<HTMLElement>(FOCAVEIS)];
    if (!itens.length) return;
    const [primeiro, ultimo] = [itens[0]!, itens[itens.length - 1]!];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }

  const soltar = () => {
    if (arrasto > 96) onFechar();
    setArrasto(0);
    inicioArrasto.current = null;
  };

  return createPortal(
    <div className="folha-fundo" onClick={onFechar}>
      <div
        ref={painel}
        className="folha"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        aria-describedby={descricao ? `${id}-desc` : undefined}
        tabIndex={-1}
        style={arrasto ? { transform: `translateY(${arrasto}px)`, transition: 'none' } : undefined}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={teclado}
      >
        <div
          className="folha-alca"
          aria-hidden="true"
          onPointerDown={(e) => {
            inicioArrasto.current = e.clientY;
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (inicioArrasto.current !== null) setArrasto(Math.max(0, e.clientY - inicioArrasto.current));
          }}
          onPointerUp={soltar}
          onPointerCancel={soltar}
        >
          <span />
        </div>
        <header className="folha-topo">
          <div>
            <h2 id={`${id}-titulo`}>{titulo}</h2>
            {descricao && (
              <p id={`${id}-desc`} className="body-sm">
                {descricao}
              </p>
            )}
          </div>
          <button type="button" className="icon-btn sem-borda" aria-label="Fechar" onClick={onFechar}>
            <Icone nome="fechar" />
          </button>
        </header>
        <div className="folha-corpo">{children}</div>
        {rodape && <div className="folha-rodape">{rodape}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Estado de abrir/fechar uma folha. */
export function useFolha<T = true>() {
  const [conteudo, setConteudo] = useState<T | null>(null);
  return {
    aberta: conteudo !== null,
    dado: conteudo,
    abrir: (v?: T) => setConteudo((v ?? true) as T),
    fechar: () => setConteudo(null),
  };
}
