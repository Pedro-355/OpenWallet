/** Peças de estrutura para o celular: ação fixa no rodapé, esqueletos, aviso de conexão e linhas tocáveis. */
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Icone } from '../ds/Icone';

/**
 * A ação principal da tela, fixa logo acima das abas, na zona do polegar.
 * É o único botão primary da tela (design system: button-lg, block).
 */
export function AcaoFixa({ children }: { children: ReactNode }) {
  return <div className="acao-fixa">{children}</div>;
}

/** Blocos cinza no lugar do conteúdo enquanto carrega: a tela não "pula" quando os dados chegam. */
export function Esqueleto({ linhas = 3, destaque = false }: { linhas?: number; destaque?: boolean }) {
  return (
    <div className={`card esqueleto${destaque ? ' destaque' : ''}`} aria-busy="true" aria-label="Carregando">
      {destaque && <span className="esq esq--valor" />}
      {Array.from({ length: linhas }, (_, i) => (
        <span key={i} className="esq esq--linha" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  );
}

const conexao = {
  get: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
  subscribe(fn: () => void) {
    window.addEventListener('online', fn);
    window.addEventListener('offline', fn);
    return () => {
      window.removeEventListener('online', fn);
      window.removeEventListener('offline', fn);
    };
  },
};

export const useOnline = () => useSyncExternalStore(conexao.subscribe, conexao.get, () => true);

/** Faixa no topo quando o celular fica sem internet (metrô, elevador, plano acabou). */
export function AvisoConexao() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="aviso-conexao" role="status">
      Sem internet. O que você já abriu continua aqui; para salvar, espere a conexão voltar.
    </div>
  );
}

/** Recarrega quando a pessoa volta para o app (tirou do bolso, trocou de aplicativo e voltou). */
export function useAoVoltarParaApp(fn: () => void) {
  useEffect(() => {
    const aoMudar = () => {
      if (document.visibilityState === 'visible') fn();
    };
    document.addEventListener('visibilitychange', aoMudar);
    window.addEventListener('online', fn);
    return () => {
      document.removeEventListener('visibilitychange', aoMudar);
      window.removeEventListener('online', fn);
    };
  }, [fn]);
}

/** Linha de lista inteira tocável (abre o detalhe), com a seta indicando que há mais. */
export function LinhaTocavel({ onClick, children, rotulo }: { onClick: () => void; children: ReactNode; rotulo: string }) {
  return (
    <li className="linha-tocavel">
      <button type="button" onClick={onClick} aria-label={rotulo}>
        {children}
        <span className="linha-tocavel__seta" aria-hidden="true">
          <Icone nome="avancar" tamanho={16} />
        </span>
      </button>
    </li>
  );
}

/** Mostra só os primeiros itens de uma lista longa, com "Ver todos". */
export function useListaCurta<T>(itens: T[], limite = 5) {
  const [todos, setTodos] = useState(false);
  return { visiveis: todos ? itens : itens.slice(0, limite), restante: Math.max(0, itens.length - limite), verTodos: () => setTodos(true), todos };
}
