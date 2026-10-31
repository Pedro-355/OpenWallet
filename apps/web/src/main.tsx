import { StrictMode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { api, auth, ApiError } from './api';
import { AuthScreen } from './AuthScreen';
import { Impostometro } from './Impostometro';
import './styles.css';

const CALLBACK_PATH = '/openfinance/callback';

/** Volta do banco depois do consentimento: confirma na API e segue para a tela principal. */
function OpenFinanceCallback({ onDone }: { onDone: (msg: string) => void }) {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const q = new URLSearchParams(window.location.search);
    const consentId = q.get('consent_id') ?? '';
    const state = q.get('state') ?? '';
    const finish = (msg: string) => {
      window.history.replaceState(null, '', '/');
      onDone(msg);
    };
    if (q.get('status') === 'REJECTED') return finish('Você recusou o acesso no banco. Nada foi conectado.');
    api
      .finishConnection(consentId, state)
      .then(({ connection }) =>
        finish(
          connection.status === 'active'
            ? 'Banco conectado! Estamos trazendo seus gastos — eles aparecem em alguns segundos.'
            : 'O banco ainda não confirmou o acesso. Tente de novo em instantes.',
        ),
      )
      .catch((err) => finish(err instanceof ApiError ? err.message : 'Não consegui confirmar a conexão.'));
  }, [onDone]);
  return (
    <main className="auth">
      <p className="muted">Confirmando a conexão com o banco…</p>
    </main>
  );
}

function App() {
  const user = useSyncExternalStore(auth.subscribe, () => auth.user);
  const [path, setPath] = useState(window.location.pathname);
  const [flash, setFlash] = useState('');
  if (!user) return <AuthScreen />;
  if (path === CALLBACK_PATH) {
    return (
      <OpenFinanceCallback
        onDone={(msg) => {
          setFlash(msg);
          setPath('/');
        }}
      />
    );
  }
  return <Impostometro user={user} flash={flash} onFlashSeen={() => setFlash('')} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
