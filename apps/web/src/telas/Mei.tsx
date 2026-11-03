import { useState, type FormEvent } from 'react';
import type { OpcaoRegime } from '@openwallet/tax';
import { brl, parseReais, pct } from '../format';
import { mvp } from '../mvpApi';
import { anoCorrente, Cabecalho, Card, dataBR, Erro, useAcao, useCarregar } from './comum';

export function Comparador() {
  const [fat, setFat] = useState('');
  const [atividade, setAtividade] = useState('servicos');
  const [opcoes, setOpcoes] = useState<OpcaoRegime[] | null>(null);
  const { ocupado, erro, executar } = useAcao();

  async function comparar(e: FormEvent) {
    e.preventDefault();
    const cents = parseReais(fat);
    if (!cents) return;
    await executar(async () => setOpcoes((await mvp.comparar(cents, atividade)).opcoes));
  }

  return (
    <form className="stack" onSubmit={comparar} aria-label="Comparar regimes">
      <div className="two">
        <label>
          Faturamento por ano (R$)
          <input inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="Ex.: 90.000" />
        </label>
        <label>
          Atividade
          <select value={atividade} onChange={(e) => setAtividade(e.target.value)}>
            <option value="servicos">Serviços</option>
            <option value="comercio">Comércio</option>
          </select>
        </label>
      </div>
      <button className="ghost" disabled={ocupado}>
        Comparar
      </button>
      <Erro mensagem={erro} />
      {opcoes && (
        <ol className="lista">
          {opcoes.map((o, i) => (
            <li key={o.regime} className={o.permitido ? '' : 'pago'}>
              <span className="what">
                <span>
                  {i === 0 && o.permitido && <span className="badge">mais barato</span>}
                  {o.nome}
                </span>
                <span className="muted small">{o.permitido ? o.detalhes : o.motivo}</span>
              </span>
              {o.permitido && (
                <span className="amount">
                  <strong>{brl(o.impostoAnualCents)}/ano</strong>
                  <span className="muted small">{pct(o.cargaPct)}</span>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </form>
  );
}

function EmitirNota({ onEmitida }: { onEmitida: () => void }) {
  const [tomador, setTomador] = useState('');
  const [doc, setDoc] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [ok, setOk] = useState('');
  const { ocupado, erro, executar } = useAcao();

  async function emitir(e: FormEvent) {
    e.preventDefault();
    const cents = parseReais(valor);
    if (!cents || !tomador.trim() || descricao.trim().length < 3) return;
    setOk('');
    const feito = await executar(async () => {
      const { nota } = await mvp.emitirNota({ tomadorNome: tomador, tomadorDoc: doc || undefined, descricao, valorCents: cents });
      setOk(`Nota nº ${nota.numero} emitida${nota.ambiente === 'teste' ? ' (ambiente de teste)' : ''}.`);
    });
    if (feito) {
      setTomador('');
      setDoc('');
      setDescricao('');
      setValor('');
      onEmitida();
    }
  }

  return (
    <form className="stack" onSubmit={emitir} aria-label="Emitir nota">
      <div className="two">
        <label>
          Cliente
          <input value={tomador} onChange={(e) => setTomador(e.target.value)} />
        </label>
        <label>
          CPF/CNPJ do cliente
          <input inputMode="numeric" value={doc} onChange={(e) => setDoc(e.target.value)} />
        </label>
      </div>
      <label>
        Serviço prestado
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </label>
      <label>
        Valor (R$)
        <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
      </label>
      <button className="primary" disabled={ocupado}>
        {ocupado ? 'Emitindo…' : 'Emitir nota'}
      </button>
      {ok && <p className="notice ok">{ok}</p>}
      <Erro mensagem={erro} />
    </form>
  );
}

export function Mei({ irParaPerfil }: { irParaPerfil?: () => void }) {
  const ano = anoCorrente();
  const painel = useCarregar(() => mvp.meiPainel(ano), [ano]);
  const notas = useCarregar(() => mvp.meiNotas(ano), [ano]);
  const atualizar = () => {
    void painel.recarregar();
    void notas.recarregar();
  };
  const p = painel.dados;

  return (
    <div className="page">
      <Cabecalho titulo="MEI" subtitulo="Limite de faturamento, DAS, notas e o regime mais barato." />
      <Erro mensagem={painel.erro} onTentar={atualizar} />
      {p && !p.ativo && (
        <p className="notice">
          Você não marcou que é MEI no perfil.{' '}
          {irParaPerfil && (
            <button className="link" onClick={irParaPerfil}>
              Abrir perfil
            </button>
          )}{' '}
          O comparador abaixo funciona mesmo assim.
        </p>
      )}
      {p && p.ativo && (
        <Card titulo={`Faturamento de ${ano}`}>
          <p className="big-sm">{brl(p.faturamento.totalCents)}</p>
          <div className="meter" role="meter" aria-valuenow={p.limite.usadoPct} aria-valuemin={0} aria-valuemax={100} aria-label="Uso do limite">
            <span className={`nivel-${p.limite.nivel}`} style={{ width: `${Math.min(100, p.limite.usadoPct)}%` }} />
          </div>
          <p className="muted small">
            {pct(p.limite.usadoPct)} de {brl(p.limite.limiteCents)} · cabe {brl(p.limite.mediaMensalDisponivelCents)}/mês até dezembro · DAS{' '}
            {brl(p.das.totalCents)}/mês
          </p>
          <p className={p.limite.nivel === 'ok' ? 'muted' : 'notice'}>{p.limite.mensagem}</p>
        </Card>
      )}
      {p?.ativo && (
        <Card titulo="Emitir nota fiscal de serviço">
          <EmitirNota onEmitida={atualizar} />
          <ul className="lista">
            {notas.dados?.notas.map((n) => (
              <li key={n.id} className={n.status === 'cancelada' ? 'pago' : ''}>
                <span className="what">
                  <span>
                    Nº {n.numero} · {n.tomadorNome}
                  </span>
                  <span className="muted small">
                    {dataBR(n.emitidaEm)} · {n.descricao}
                    {n.status === 'cancelada' && ' · cancelada'}
                  </span>
                </span>
                <strong>{brl(n.valorCents)}</strong>
                {n.status === 'emitida' && (
                  <button
                    className="ghost"
                    onClick={() => {
                      if (window.confirm(`Cancelar a nota nº ${n.numero}?`)) void mvp.cancelarNota(n.id).then(atualizar);
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card titulo="MEI, Simples ou autônomo?">
        <Comparador />
      </Card>
    </div>
  );
}
