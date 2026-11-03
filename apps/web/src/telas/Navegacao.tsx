import { useCallback, useEffect, useRef, useState } from 'react';
import { Icone, type NomeIcone } from '../ds/Icone';

export type Aba = 'inicio' | 'notas' | 'ir' | 'agenda' | 'mei' | 'ajuda';

export const ABAS: { id: Aba; rotulo: string; icone: NomeIcone }[] = [
  { id: 'inicio', rotulo: 'Início', icone: 'inicio' },
  { id: 'notas', rotulo: 'Notas', icone: 'notas' },
  { id: 'ir', rotulo: 'IR', icone: 'ir' },
  { id: 'agenda', rotulo: 'Agenda', icone: 'agenda' },
  { id: 'mei', rotulo: 'MEI', icone: 'mei' },
  { id: 'ajuda', rotulo: 'Ajuda', icone: 'ajuda' },
];

const abaDaUrl = (): Aba => {
  const h = window.location.hash.slice(1);
  return (ABAS.some((a) => a.id === h) ? h : 'inicio') as Aba;
};

/**
 * Navegação entre abas pensada para o celular:
 * - cada troca vira uma entrada no histórico, então o Voltar do Android volta para a aba anterior;
 * - cada aba lembra onde estava a rolagem;
 * - tocar de novo na aba em que já está leva ao topo.
 */
export function useAbas(): [Aba, (a: Aba) => void] {
  const [aba, setAba] = useState<Aba>(abaDaUrl);
  const rolagem = useRef(new Map<Aba, number>());
  const atual = useRef(aba);
  atual.current = aba;

  useEffect(() => {
    const aoVoltar = (e: PopStateEvent) => {
      if (e.state?.folha) return; // quem cuida é a folha inferior
      rolagem.current.set(atual.current, window.scrollY);
      setAba(abaDaUrl());
    };
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, []);

  useEffect(() => {
    const y = rolagem.current.get(aba) ?? 0;
    requestAnimationFrame(() => window.scrollTo({ top: y }));
  }, [aba]);

  const irPara = useCallback((a: Aba) => {
    if (a === atual.current) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    rolagem.current.set(atual.current, window.scrollY);
    window.history.pushState({ aba: a }, '', a === 'inicio' ? window.location.pathname : `#${a}`);
    setAba(a);
  }, []);

  return [aba, irPara];
}

/** Abas fixas no rodapé. A aba ativa usa primary (a única cor de marca da tela). */
export function Navegacao({ atual, onTrocar }: { atual: Aba; onTrocar: (a: Aba) => void }) {
  return (
    <nav className="abas" aria-label="Seções">
      {ABAS.map((a) => (
        <button key={a.id} type="button" aria-current={a.id === atual ? 'page' : undefined} onClick={() => onTrocar(a.id)}>
          <Icone nome={a.icone} tamanho={22} />
          {a.rotulo}
        </button>
      ))}
    </nav>
  );
}
