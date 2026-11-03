import { useState, type FormEvent } from 'react';
import { UFS } from '@openwallet/tax';
import { auth, ApiError } from './api';
import { InstallBanner } from './InstallBanner';
import { Button } from './ds/componentes';

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [uf, setUf] = useState('SP');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await auth.login(email, password);
      else await auth.register(email, password, uf);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sem conexão com o servidor');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="auth-card">
        <InstallBanner />
        <p className="overline">OpenWallet</p>
        <h1>{mode === 'login' ? 'Que bom ver você de novo' : 'Crie sua conta'}</h1>
        <p className="body-sm">Veja quanto imposto você paga, recupere o que é seu e fique em dia com o Leão.</p>
        <form onSubmit={submit} className="stack">
          <label>
            E-mail
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Senha
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 8 : 1}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {mode === 'register' && (
            <label>
              Seu estado
              <select value={uf} onChange={(e) => setUf(e.target.value)}>
                {UFS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          <Button variant="primary" size="lg" block type="submit" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </Button>
        </form>
        <Button variant="ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}
        </Button>
      </div>
    </main>
  );
}
