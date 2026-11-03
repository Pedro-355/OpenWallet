import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ApiError } from '../api';
import { Icone } from '../ds/Icone';
import { privacidade } from '../ds/privacidade';

export const mensagemDeErro = (err: unknown) => (err instanceof ApiError ? err.message : 'Sem conexão com o servidor.');

/** Carrega dados de forma assíncrona, com estado de carregamento, erro e recarga. */
export function useCarregar<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const carregar = useCallback(fn, deps);
  const recarregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      setDados(await carregar());
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setCarregando(false);
    }
  }, [carregar]);
  useEffect(() => {
    void recarregar();
  }, [recarregar]);
  return { dados, erro, carregando, recarregar };
}

/** Executa uma ação (salvar, apagar...) guardando o estado de "ocupado" e o erro. */
export function useAcao() {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const executar = useCallback(async (fn: () => Promise<unknown>) => {
    setOcupado(true);
    setErro('');
    try {
      await fn();
      return true;
    } catch (err) {
      setErro(mensagemDeErro(err));
      return false;
    } finally {
      setOcupado(false);
    }
  }, []);
  return { ocupado, erro, executar };
}

/** Botão de olho: oculta ou mostra todos os valores do app. */
export function BotaoOcultar() {
  const oculto = useSyncExternalStore(privacidade.subscribe, privacidade.get, privacidade.get);
  return (
    <button
      type="button"
      className="icon-btn"
      aria-pressed={oculto}
      aria-label={oculto ? 'Mostrar valores' : 'Ocultar valores'}
      onClick={() => privacidade.set(!oculto)}
    >
      <Icone nome={oculto ? 'olhoFechado' : 'olho'} />
    </button>
  );
}

export function Cabecalho({ titulo, subtitulo, acoes }: { titulo: string; subtitulo?: string; acoes?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar-titulo">
        <h1>{titulo}</h1>
        {subtitulo && <p className="body-sm">{subtitulo}</p>}
      </div>
      <div className="topbar-acoes">
        {acoes}
        <BotaoOcultar />
      </div>
    </header>
  );
}

export function Erro({ mensagem, onTentar }: { mensagem: string; onTentar?: () => void }) {
  if (!mensagem) return null;
  return (
    <p className="error" role="alert">
      {mensagem}{' '}
      {onTentar && (
        <button type="button" className="ow-link" onClick={onTentar}>
          Tentar de novo
        </button>
      )}
    </p>
  );
}

export function Aviso({ tom = 'info', children }: { tom?: 'info' | 'atencao' | 'ok'; children: ReactNode }) {
  return <p className={`aviso aviso--${tom}`}>{children}</p>;
}

export function Card({ titulo, children, acao, destaque }: { titulo?: string; children: ReactNode; acao?: ReactNode; destaque?: boolean }) {
  return (
    <section className={destaque ? 'card destaque' : 'card'}>
      {(titulo || acao) && (
        <div className="card-head">
          {titulo && <h2>{titulo}</h2>}
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}

export const anoCorrente = () => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(new Date()));

export const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
