import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../api';

export const mensagemDeErro = (err: unknown) => (err instanceof ApiError ? err.message : 'Sem conexão com o servidor.');

/** Carrega dados de forma assíncrona, com estado de carregamento, erro e recarga. */
export function useCarregar<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

export function Cabecalho({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">OpenWallet</p>
        <h1>{titulo}</h1>
        {subtitulo && <p className="muted small">{subtitulo}</p>}
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
        <button className="link" onClick={onTentar}>
          Tentar de novo
        </button>
      )}
    </p>
  );
}

export function Card({ titulo, children, acao }: { titulo: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="card">
      <div className="row card-head">
        <h2>{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

export const anoCorrente = () => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(new Date()));

export const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
