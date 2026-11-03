import { useCallback, useEffect, useState } from 'react';
import { UFS, type TaxRatesTable } from '@openwallet/tax';
import { api, auth, ApiError, type Connection, type Expense, type History, type Summary, type User } from './api';
import { InstallBanner } from './InstallBanner';
import { ExpenseForm } from './ExpenseForm';
import { AnualCard } from './telas/AnualCard';
import { Sugestoes } from './telas/Sugestoes';
import { BotaoOcultar, Aviso } from './telas/comum';
import type { Aba } from './telas/Navegacao';
import { Button, Iniciais, Money, OQueE, Tag } from './ds/componentes';
import { Icone } from './ds/Icone';
import { dataLista, lastDay, mesAno, monthLong, monthShort, pct, shiftMonth, todayISO } from './format';

export function Impostometro({ user, flash, onFlashSeen, irPara }: { user: User; flash?: string; onFlashSeen?: () => void; irPara?: (a: Aba) => void }) {
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
        <div className="topbar-titulo">
          <h1>Início</h1>
          <p className="body-sm">Quanto do que você gasta vira imposto.</p>
        </div>
        <div className="topbar-acoes">
          <label className="sr-only" htmlFor="uf-perfil">
            Seu estado
          </label>
          <select id="uf-perfil" className="uf-pick" value={user.uf} onChange={(e) => void changeUf(e.target.value)} title="Estado usado no cálculo do ICMS">
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <BotaoOcultar />
          <button type="button" className="icon-btn sem-borda" aria-label="Sair" onClick={() => void auth.logout()}>
            <Icone nome="sair" />
          </button>
        </div>
      </header>

      <InstallBanner />

      <nav className="mes-nav" aria-label="Mês">
        <button type="button" className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior">
          <Icone nome="voltar" />
        </button>
        <span className="title-md">{mesAno(month)}</span>
        <button type="button" className="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))} disabled={isCurrentMonth} aria-label="Próximo mês">
          <Icone nome="avancar" />
        </button>
      </nav>

      {flash && <Aviso tom="ok">{flash}</Aviso>}
      {error && (
        <p className="error" role="alert">
          {error}{' '}
          <button type="button" className="ow-link" onClick={() => void load()}>
            Tentar de novo
          </button>
        </p>
      )}

      <section className="card destaque" aria-busy={loading}>
        <span className="overline">Impostos em {monthLong(month)}</span>
        <Money cents={summary?.totals.taxCents ?? 0} size="xl" />
        <p className="body-sm">
          de <Money cents={summary?.totals.spentCents ?? 0} size="sm" /> que você gastou ({pct(summary?.totals.effectivePct ?? 0)})
        </p>
        {summary && summary.totals.taxCents > 0 && <SphereBar s={summary} />}
        <p className="caption">
          No ano, até agora: <Money cents={summary?.yearToDate.taxCents ?? 0} size="sm" /> em impostos.
        </p>
        {summary?.illustrative && <p className="caption">As alíquotas ainda são ilustrativas: a tabela oficial do IBPT entra antes do lançamento.</p>}
      </section>

      {irPara && <Sugestoes irPara={irPara} />}

      <AnualCard versao={summary?.yearToDate.taxCents ?? 0} />

      <section className="card">
        <h2>Novo gasto</h2>
        {rates ? <ExpenseForm rates={rates} defaultUf={user.uf} month={month} onSaved={load} /> : <p className="caption">Carregando…</p>}
      </section>

      <section className="card">
        <h2>Últimos meses</h2>
        {history && <HistoryChart history={history} current={month} />}
      </section>

      {ofEnabled && <BankConnections connections={connections} onChange={load} />}

      <section className="card">
        <h2>Por categoria</h2>
        {summary && summary.byCategory.length === 0 && <p className="body-sm">Nenhum gasto neste mês.</p>}
        <ul className="lista">
          {summary?.byCategory.map((c) => (
            <li key={c.category}>
              <div className="item-texto">
                <span>{c.label}</span>
                <span className="label">
                  {pct(c.effectivePct)} de <Money cents={c.spentCents} size="sm" />
                </span>
                <div className="ow-progress ow-progress--primary" role="presentation">
                  <span className="ow-progress__fill" style={{ width: `${(c.taxCents / Math.max(1, summary.totals.taxCents)) * 100}%` }} />
                </div>
              </div>
              <Money cents={c.taxCents} />
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Gastos</h2>
        {expenses.length === 0 && !loading && <p className="body-sm">Nada lançado em {monthLong(month)}.</p>}
        <ul className="lista">
          {expenses.map((e) => (
            <li key={e.id}>
              <div className="item-texto">
                <span>{e.description || rates?.categories[e.category]?.label || e.category}</span>
                <span className="label">
                  {dataLista(e.spentOn)} · {rates?.categories[e.category]?.label ?? e.category} · {e.uf}
                </span>
                {e.source === 'openfinance' && <Tag tone="primary">Banco</Tag>}
                {e.source === 'nfce' && <Tag tone="primary">Nota</Tag>}
              </div>
              <div className="item-valor">
                <Money cents={-e.amountCents} signed tone="neutral" />
                <span className="label">
                  <Money cents={e.tax.totalCents} size="sm" /> imposto
                </span>
              </div>
              <button type="button" className="icon-btn sem-borda" aria-label="Apagar" onClick={() => void remove(e.id)}>
                <Icone nome="lixeira" tamanho={18} />
              </button>
            </li>
          ))}
        </ul>
        {nextCursor && (
          <Button variant="secondary" block onClick={() => void loadMore()}>
            Carregar mais gastos
          </Button>
        )}
      </section>

      <footer className="rodape">
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
  const statusLabel: Record<Connection['status'], { texto: string; tom: 'positive' | 'attention' | 'neutral' }> = {
    active: { texto: 'Conectado', tom: 'positive' },
    pending: { texto: 'Aguardando autorização', tom: 'neutral' },
    error: { texto: 'Com erro', tom: 'attention' },
    rejected: { texto: 'Recusado', tom: 'neutral' },
    revoked: { texto: 'Desconectado', tom: 'neutral' },
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>Contas conectadas</h2>
        <OQueE termo="Open Finance">
          Open Finance é o sistema do Banco Central que deixa você compartilhar seus dados bancários com outro app, só com a sua autorização, e
          cancelar quando quiser.
        </OQueE>
      </div>
      {visible.length === 0 && <p className="body-sm">Conecte seu cartão pelo Open Finance e os gastos entram aqui sozinhos, já com o imposto calculado.</p>}
      <ul className="lista">
        {visible.map((c) => (
          <li key={c.id}>
            <Iniciais nome={c.institution} />
            <div className="item-texto">
              <span>{c.institution}</span>
              <span className="label">
                {c.lastSyncAt ? `Atualizado ${dataLista(c.lastSyncAt.slice(0, 10))}` : 'Ainda sem atualização'}
              </span>
              <Tag tone={statusLabel[c.status].tom}>{statusLabel[c.status].texto}</Tag>
              {c.status === 'error' && c.lastError && <span className="error">{c.lastError}</span>}
            </div>
            <div className="item-valor">
              {c.status === 'active' && (
                <Button variant="secondary" disabled={!!busy} onClick={() => void run(c.id, async () => { await api.syncConnection(c.id); setTimeout(() => void onChange(), 2_000); })}>
                  {busy === c.id ? 'Atualizando…' : 'Atualizar'}
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={!!busy}
                onClick={() => {
                  if (window.confirm(`Desconectar ${c.institution}? Os gastos já importados continuam aqui.`)) {
                    void run(`del-${c.id}`, async () => { await api.disconnect(c.id); await onChange(); });
                  }
                }}
              >
                Desconectar
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
      <Button variant="ink" onClick={() => void connect()} disabled={!!busy}>
        {busy === 'connect' ? 'Abrindo o banco…' : 'Conectar banco'}
      </Button>
      <p className="caption">Ambiente de teste: o Banco Sandbox gera compras fictícias.</p>
    </section>
  );
}

/** Divisão do imposto por esfera: primary-strong, chart-2 e ink-muted, sempre com rótulo e valor. */
function SphereBar({ s }: { s: Summary }) {
  const t = s.totals;
  const parts = [
    { key: 'serie-1', label: 'Federal', cents: t.federalCents },
    { key: 'serie-2', label: 'Estadual (ICMS)', cents: t.estadualCents },
    { key: 'serie-3', label: 'Municipal (ISS)', cents: t.municipalCents },
  ].filter((p) => p.cents > 0);
  return (
    <div className="stack">
      <div className="barra-dividida" aria-hidden="true">
        {parts.map((p) => (
          <span key={p.key} className={p.key} style={{ width: `${(p.cents / t.taxCents) * 100}%` }} />
        ))}
      </div>
      <ul className="legenda">
        {parts.map((p) => (
          <li key={p.key}>
            <i className={p.key} /> {p.label} <Money cents={p.cents} size="sm" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistoryChart({ history, current }: { history: History; current: string }) {
  const max = Math.max(1, ...history.months.map((m) => m.taxCents));
  return (
    <div className="historico">
      {history.months.map((m) => (
        <div key={m.month} className={`barra ${m.month === current ? 'atual' : ''}`} title={`${monthLong(m.month)}`}>
          <span className="topo">{m.taxCents ? <Money cents={m.taxCents} size="sm" compact /> : ''}</span>
          <span className="preenche" style={{ height: `${(m.taxCents / max) * 100}%` }} />
          <span className="rotulo">{monthShort(m.month)}</span>
        </div>
      ))}
    </div>
  );
}
