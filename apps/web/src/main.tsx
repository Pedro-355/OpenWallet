import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { auth } from './api';
import { AuthScreen } from './AuthScreen';
import { Impostometro } from './Impostometro';
import './styles.css';

function App() {
  const user = useSyncExternalStore(auth.subscribe, () => auth.user);
  return user ? <Impostometro user={user} /> : <AuthScreen />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
