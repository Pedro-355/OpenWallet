/**
 * Avisos rápidos (toasts) no pé da tela, logo acima das abas: confirmam o que aconteceu
 * sem interromper e oferecem "Desfazer" no lugar de caixas de confirmação.
 * Uma vibração curta confirma no celular (onde o aparelho permite).
 */
import { useSyncExternalStore } from 'react';

export interface Aviso {
  id: number;
  texto: string;
  tom: 'ok' | 'erro' | 'info';
  acao?: { rotulo: string; fn: () => void };
}

let lista: Aviso[] = [];
let proximoId = 1;
const ouvintes = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const emitir = () => ouvintes.forEach((f) => f());

export function vibrar(padrao: number | number[] = 12) {
  try {
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) navigator.vibrate?.(padrao);
  } catch {
    /* sem vibração neste aparelho */
  }
}

export const avisos = {
  get: () => lista,
  subscribe(fn: () => void) {
    ouvintes.add(fn);
    return () => {
      ouvintes.delete(fn);
    };
  },
  /** Mostra um aviso por alguns segundos (mais tempo quando tem "Desfazer"). */
  mostrar(texto: string, opcoes: { tom?: Aviso['tom']; acao?: Aviso['acao']; duracaoMs?: number } = {}): number {
    const id = proximoId++;
    const tom = opcoes.tom ?? 'ok';
    lista = [...lista.slice(-1), { id, texto, tom, acao: opcoes.acao }];
    emitir();
    if (tom === 'ok') vibrar();
    if (tom === 'erro') vibrar([30, 40, 30]);
    timers.set(id, setTimeout(() => avisos.fechar(id), opcoes.duracaoMs ?? (opcoes.acao ? 6_000 : 3_500)));
    return id;
  },
  fechar(id: number) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    lista = lista.filter((a) => a.id !== id);
    emitir();
  },
  /** Só para testes. */
  _limpar() {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    lista = [];
    emitir();
  },
};

/**
 * Executa uma ação destrutiva só depois de alguns segundos, dando a chance de desfazer.
 * Enquanto isso, `aoAgendar` esconde o item da tela (atualização otimista).
 */
export function comDesfazer(opts: { texto: string; executar: () => Promise<unknown>; aoAgendar: () => void; aoDesfazer: () => void; aoFalhar?: (err: unknown) => void; esperaMs?: number }) {
  const espera = opts.esperaMs ?? 5_000;
  opts.aoAgendar();
  let desfeito = false;
  const timer = setTimeout(() => {
    if (desfeito) return;
    opts.executar().catch((err) => {
      opts.aoDesfazer();
      opts.aoFalhar?.(err);
      avisos.mostrar('Não deu certo. Tente de novo.', { tom: 'erro' });
    });
  }, espera);
  avisos.mostrar(opts.texto, {
    duracaoMs: espera,
    acao: {
      rotulo: 'Desfazer',
      fn: () => {
        desfeito = true;
        clearTimeout(timer);
        opts.aoDesfazer();
      },
    },
  });
}

export function Avisos() {
  const itens = useSyncExternalStore(avisos.subscribe, avisos.get, avisos.get);
  return (
    <div className="avisos" role="status" aria-live="polite">
      {itens.map((a) => (
        <div key={a.id} className={`aviso-rapido aviso-rapido--${a.tom}`}>
          <span>{a.texto}</span>
          {a.acao && (
            <button
              type="button"
              className="aviso-rapido__acao"
              onClick={() => {
                a.acao!.fn();
                avisos.fechar(a.id);
              }}
            >
              {a.acao.rotulo}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
