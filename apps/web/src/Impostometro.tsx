import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { UFS, calculateTax, isUF, type TaxRatesTable } from '@openwallet/tax';
import { api, auth, ApiError, type Connection, type Expense, type History, type Summary, type User } from './api';
import { brl, capitalize, dayLabel, lastDay, monthLong, monthShort, parseMoney, pct, shiftMonth, todayISO } from './format';

export function Impostometro({ user, flash, onFlashSeen }: { user: User; flash?: string; onFlashSeen?: () => void }) {
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [rates, setRates] = useState<TaxRatesTable | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [ofEnabled, setOfEnabled] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);

  useEffect(() => {
    api.rates().then(setRates).catch(() => setError('Não consegui carregar a tabela de impostos.'));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, h, list, conns] = await Promise.all([
        api.summary(month),
        api.history(6),
        api.expenses(`${month}-01`, lastDay(month)),
        api.connections().catch(() => ({ enabled: false, connections: [] as Connection[] })),
      ]);
      setOfEnabled(conns.enabled);
      setConnections(conns.connections);
      setSummary(s);
      setHistory(h);
      setExpenses(list.items);
      setNextCursor(list.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sem conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasActive = connections.some((c) => c.status === 'active' || c.status === 'pending');
  // Com banco conectado, novos gastos chegam sozinhos: atualiza a tela a cada 15 s (só com a aba visível).
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 15_000);
    return () => clearInterval(t);
  }, [hasActive, load]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => {
      onFlashSeen?.();
      void load();
    }, 6_000);
    return () => clearTimeout(t);
  }, [flash, onFlashSeen, load]);

  async function loadMore() {
    if (!nextCursor) return;
    const list = await api.expenses(`${month}-01`, lastDay(month), nextCursor);
    setExpenses((cur) => [...cur, ...list.items]);
    setNextCursor(list.nextCursor);
  }

  async function changeUf(uf: string) {
    const { user: u } = await api.updateUf(uf);
    auth.setUser(u);
  }

  async function remove(id: string) {
    if (!window.confirm('Apagar este gasto?')) return;
    await api.deleteExpense(id);
    await load();
  }

  const isCurrentMonth = month >= todayISO().slice(0, 7);

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">OpenWallet</p>
          <h1>Impostômetro</h1>
        </div>
        <div className="topbar-actions">
          <label className="uf-pick" title="Estado usado no cálculo do ICMS">
            UF
            <select value={user.uf} onChange={(e) => void changeUf(e.target.value)}>
              {UFS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
          <button className="ghost" onClick={() => void auth.logout()}>
            Sair
          </button>
        </div>
      </header>

      <nav className="month-nav" aria-label="Mês">
        <button className="ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior">
          ‹
        </button>
        <strong>{capitalize(monthLong(month))}</strong>
        <button className="ghost" onClick={() => setMonth(shiftMonth(month, 1))} disabled={isCurrentMonth} aria-label="Próximo mês">
          ›
        </button>
      </nav>

      {flash && <p className="notice ok">{flash}</p>}
      {summary?.illustrative && (
        <p className="notice">
          Alíquotas ilustrativas: os valores ainda não vieram da tabela oficial do IBPT.
        </p>
      )}
      {error && (
        <p className="error">
          {error} <button className="link" onClick={() => void load()}>Tentar de novo</button>
        </p>
      )}

      <section className="hero card" aria-busy={loading}>
        <p className="muted">Neste mês, dos seus gastos foram para impostos</p>
        <p className="big">{brl(summary?.totals.taxCents ?? 0)}</p>
        <p className="muted">
          de {brl(summary?.totals.spentCents ?? 0)} gastos ·{' '}
          <strong className="accent">{pct(summary?.totals.effectivePct ?? 0)}</strong> do total
        </p>
        {summary && summary.totals.taxCents > 0 && <SphereBar s={summary} />}
        <p className="muted small">No ano até aqui: {brl(summary?.yearToDate.taxCents ?? 0)} em impostos</p>
      </section>

      <div className="grid">
        <section className="card">
          <h2>Novo gasto</h2>
          {rates ? <ExpenseForm rates={rates} defaultUf={user.uf} month={month} onSaved={load} /> : <p className="muted">Carregando…</p>}
        </section>

        <section className="card">
          <h2>Últimos meses</h2>
          {history && <HistoryChart history={history} current={month} />}
        </section>
      </div>

      {ofEnabled && <BankConnections connections={connections} onChange={load} />}

      <section className="card">
        <h2>Por categoria</h2>
        {summary && summary.byCategory.length === 0 && <p className="muted">Nenhum gasto neste mês.</p>}
        <ul className="cats">
          {summary?.byCategory.map((c) => (
            <li key={c.category}>
              <div className="row">
                <span>{c.label}</span>
                <span>
                  <strong>{brl(c.taxCents)}</strong> <span className="muted small">de {brl(c.spentCents)} · {pct(c.effectivePct)}</span>
                </span>
              </div>
              <div className="meter">
                <span style={{ width: `${(c.taxCents / Math.max(1, summary.totals.taxCents)) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Gastos</h2>
        {expenses.length === 0 && !loading && <p className="muted">Nada lançado em {monthLong(month)}.</p>}
        <ul className="expenses">
          {expenses.map((e) => (
            <li key={e.id}>
              <span className="date">{dayLabel(e.spentOn)}</span>
              <span className="what">
                <span>{e.description || rates?.categories[e.category]?.label || e.category}</span>
                <span className="muted small">
                  {e.source === 'openfinance' && <span className="badge">Banco</span>}
                  {rates?.categories[e.category]?.label ?? e.category} · {e.uf}
                </span>
              </span>
              <span className="amount">
                <span>{brl(e.amountCents)}</span>
                <span className="tax small">
                  {brl(e.tax.totalCents)} imposto · {pct(e.tax.ratePct)}
                </span>
              </span>
              <button className="ghost icon" aria-label="Apagar" onClick={() => void remove(e.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
        {nextCursor && (
          <button className="ghost wide" onClick={() => void loadMore()}>
            Carregar mais
          </button>
        )}
      </section>

      <footer className="muted small">
        Valores aproximados, conforme a Lei 12.741/2012. Fonte das alíquotas: {rates?.source ?? '—'}.
      </footer>
    </div>
  );
}

function BankConnections({ connections, onChange }: { connections: Connection[]; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sem conexão com o servidor.');
    } finally {
      setBusy('');
    }
  }

  const connect = () =>
    run('connect', async () => {
      const { authorizeUrl } = await api.connectBank();
      window.location.assign(authorizeUrl); // vai para a tela de consentimento do banco
    });

  const visible = connections.filter((c) => c.status !== 'revoked');
  const statusLabel: Record<Connection['status'], string> = {
    active: 'Conectado',
    pending: 'Aguardando autorização',
    error: 'Com erro',
    rejected: 'Recusado',
    revoked: 'Desconectado',
  };

  return (
    <section className="card">
      <div className="row">
        <h2>Contas conectadas</h2>
        <button className="primary small-btn" onClick={() => void connect()} disabled={!!busy}>
          {busy === 'connect' ? 'Abrindo o banco…' : '+ Conectar banco'}
        </button>
      </div>
      {visible.length === 0 && (
        <p className="muted">
          Conecte seu cartão pelo Open Finance e os gastos entram aqui sozinhos, já com o imposto calculado.
        </p>
      )}
      <ul className="conns">
        {visible.map((c) => (
          <li key={c.id}>
            <span className={`dot ${c.status}`} />
            <span className="what">
              <span>{c.institution}</span>
              <span className="muted small">
                {statusLabel[c.status]}
                {c.lastSyncAt && ` · atualizado ${new Date(c.lastSyncAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
              </span>
            </span>
            {c.status === 'active' && (
              <button className="ghost" disabled={!!busy} onClick={() => void run(c.id, async () => { await api.syncConnection(c.id); setTimeout(() => void onChange(), 2_000); })}>
                {busy === c.id ? '…' : 'Atualizar'}
              </button>
            )}
            <button
              className="ghost"
              disabled={!!busy}
              onClick={() => {
                if (window.confirm(`Desconectar ${c.institution}? Os gastos já importados continuam aqui.`)) {
                  void run(`del-${c.id}`, async () => { await api.disconnect(c.id); await onChange(); });
                }
              }}
            >
              Desconectar
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
      <p className="muted small">Ambiente de teste: o "Banco Sandbox" gera compras fictícias automaticamente.</p>
    </section>
  );
}

function SphereBar({ s }: { s: Summary }) {
  const t = s.totals;
  const parts = [
    { key: 'fed', label: 'Federal', cents: t.federalCents },
    { key: 'est', label: 'Estadual (ICMS)', cents: t.estadualCents },
    { key: 'mun', label: 'Municipal (ISS)', cents: t.municipalCents },
  ].filter((p) => p.cents > 0);
  return (
    <div className="spheres">
      <div className="stacked">
        {parts.map((p) => (
          <span key={p.key} className={p.key} style={{ width: `${(p.cents / t.taxCents) * 100}%` }} />
        ))}
      </div>
      <ul className="legend">
        {parts.map((p) => (
          <li key={p.key}>
            <i className={p.key} /> {p.label} <strong>{brl(p.cents)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistoryChart({ history, current }: { history: History; current: string }) {
  const max = Math.max(1, ...history.months.map((m) => m.taxCents));
  return (
    <div className="history">
      {history.months.map((m) => (
        <div key={m.month} className={`bar ${m.month === current ? 'current' : ''}`} title={`${monthLong(m.month)}: ${brl(m.taxCents)}`}>
          <span className="value small">{m.taxCents ? brl(m.taxCents).replace(/,\d\d$/, '') : ''}</span>
          <span className="fill" style={{ height: `${(m.taxCents / max) * 100}%` }} />
          <span className="label small">{monthShort(m.month)}</span>
        </div>
      ))}
    </div>
  );
}

function ExpenseForm({ rates, defaultUf, month, onSaved }: { rates: TaxRatesTable; defaultUf: string; month: string; onSaved: () => Promise<void> }) {
  const today = todayISO();
  const defaultDate = today.startsWith(month) ? today : lastDay(month);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(rates.fallbackCategory);
  const [description, setDescription] = useState('');
  const [uf, setUf] = useState(defaultUf);
  const [spentOn, setSpentOn] = useState(defaultDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Mesma chave enquanto o formulário não for salvo com sucesso → reenvio não duplica.
  const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());

  useEffect(() => setUf(defaultUf), [defaultUf]);
  useEffect(() => setSpentOn(defaultDate), [defaultDate]);

  const cents = parseMoney(amount);
  // Prévia calculada no próprio aparelho: instantânea e sem carga no servidor.
  const preview = useMemo(
    () => (cents && isUF(uf) ? calculateTax(rates, { amountCents: cents, category, uf }) : null),
    [cents, category, uf, rates],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!cents) return setError('Informe um valor válido.');
    setBusy(true);
    setError('');
    try {
      await api.createExpense({ amountCents: cents, category, description, uf, spentOn }, idemKey);
      setAmount('');
      setDescription('');
      setIdemKey(crypto.randomUUID());
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sem conexão. Tente de novo — não vai duplicar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="two">
        <label>
          Valor (R$)
          <input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label>
          Data
          <input type="date" value={spentOn} max={today} onChange={(e) => setSpentOn(e.target.value)} required />
        </label>
      </div>
      <div className="two">
        <label>
          Categoria
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(rates.categories).map(([key, c]) => (
              <option key={key} value={key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          UF da compra
          <select value={uf} onChange={(e) => setUf(e.target.value)}>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Descrição (opcional)
        <input maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: posto da esquina" />
      </label>
      <p className="preview" aria-live="polite">
        {preview ? (
          <>
            ≈ <strong>{brl(preview.totalCents)}</strong> de imposto ({pct(preview.ratePct)})
          </>
        ) : (
          <span className="muted">Digite um valor para ver o imposto embutido.</span>
        )}
      </p>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>
        {busy ? 'Salvando…' : 'Adicionar gasto'}
      </button>
    </form>
  );
}
