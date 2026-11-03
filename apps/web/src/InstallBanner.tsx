import { useState, useSyncExternalStore } from 'react';
import { installState } from './install';

const DISMISS_KEY = 'openwallet.install-dismissed';

/** Convite para instalar o app na tela inicial (Android: botão; iPhone: instrução). */
export function InstallBanner() {
  const state = useSyncExternalStore(installState.subscribe, installState.get);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (state === 'none' || dismissed) return null;

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ok */
    }
  };

  return (
    <div className="install">
      <img src="/icons/icon-192.png" alt="" width={40} height={40} />
      <div className="install-text">
        <strong>Instale o OpenWallet</strong>
        {state === 'prompt' ? (
          <span className="muted small">Abre direto da tela inicial, em tela cheia.</span>
        ) : (
          <span className="muted small">
            No Safari, toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.
          </span>
        )}
      </div>
      {state === 'prompt' && (
        <button className="primary small-btn" onClick={() => void installState.prompt()}>
          Instalar
        </button>
      )}
      <button className="ghost icon" aria-label="Fechar" onClick={close}>
        ×
      </button>
    </div>
  );
}
