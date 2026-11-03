import { useState, useSyncExternalStore } from 'react';
import { installState } from './install';
import { Button } from './ds/componentes';
import { Icone } from './ds/Icone';

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
        <strong>Que tal instalar o OpenWallet?</strong>
        {state === 'prompt' ? (
          <span>Ele abre direto da tela inicial, em tela cheia.</span>
        ) : (
          <span>
            No Safari, toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.
          </span>
        )}
      </div>
      {state === 'prompt' && (
        <Button variant="ink" onClick={() => void installState.prompt()}>
          Instalar
        </Button>
      )}
      <button type="button" className="icon-btn sem-borda" aria-label="Fechar" onClick={close}>
        <Icone nome="fechar" tamanho={18} />
      </button>
    </div>
  );
}
