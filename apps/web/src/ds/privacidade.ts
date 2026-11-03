/** Botão de olho: oculta todos os valores (Money) do app. A escolha fica salva no aparelho. */
const CHAVE = 'openwallet.ocultar-valores';
const ouvintes = new Set<() => void>();

function ler(): boolean {
  try {
    return localStorage.getItem(CHAVE) === '1';
  } catch {
    return false;
  }
}

let oculto = ler();

export const privacidade = {
  get: () => oculto,
  subscribe(fn: () => void) {
    ouvintes.add(fn);
    return () => {
      ouvintes.delete(fn);
    };
  },
  set(v: boolean) {
    oculto = v;
    try {
      localStorage.setItem(CHAVE, v ? '1' : '0');
    } catch {
      /* modo privado: fica só em memória */
    }
    ouvintes.forEach((f) => f());
  },
  /** Só para testes. */
  _recarregar() {
    oculto = ler();
  },
};
