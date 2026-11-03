import { useState, type FormEvent } from 'react';
import type { OpcaoRegime } from '@openwallet/tax';
import { dataLista, parseReais, pct } from '../format';
import { mvp } from '../mvpApi';
import { Button, Chip, Iniciais, Money, OQueE, ProgressBar, Tag } from '../ds/componentes';
import { anoCorrente, Aviso, Cabecalho, Card, Erro, useAcao, useCarregar } from './comum';

export function Comparador() {
  const [fat, setFat] = useState('');
  const [atividade, setAtividade] = useState<'servicos' | 'comercio'>('servicos');
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
      <label>
        Faturamento por ano (R$)
        <input inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="Ex.: 90.000" />
      </label>
      <div className="chips" role="group" aria-label="Atividade">
        <Chip selected={atividade === 'servicos'} onClick={() => setAtividade('servicos')}>
          Serviços
        </Chip>
        <Chip selected={atividade === 'comercio'} onClick={() => setAtividade('comercio')}>
          Comércio
        </Chip>
      </div>
      <Button variant="ink" type="submit" disabled={ocupado}>
        Comparar regimes
      </Button>
      <Erro mensagem={erro} />
      {opcoes && (
        <ol className="lista">
          {opcoes.map((o, i) => (
            <li key={o.regime} className={o.permitido ? '' : 'apagado'}>
              <div className="item-texto">
                <span>{o.nome}</span>
                {i === 0 && o.permitido && <Tag tone="positive">Mais barato</Tag>}
                <span className="caption">{o.permitido ? o.detalhes : o.motivo}</span>
              </div>
              {o.permitido && (
                <div className="item-valor">
                  <Money cents={o.impostoAnualCents} />
                  <span className="label">por ano · {pct(o.cargaPct)}</span>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {opcoes && <p className="caption">Estimativa para comparar. Antes de mudar de regime, vale conversar com um contador.</p>}
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
          CPF ou CNPJ do cliente
          <input inputMode="numeric" value={doc} onChange={(e) => setDoc(e.target.value)} />
        </label>
      </div>
      <label>
        Serviço prestado
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </label>
      <label>
        Valor (R$)
        <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="R$ 0,00" />
      </label>
      <Button variant="ink" type="submit" disabled={ocupado}>
        {ocupado ? 'Emitindo…' : 'Emitir nota'}
      </Button>
      {ok && <Aviso tom="ok">{ok}</Aviso>}
      <Erro mensagem={erro} />
    </form>
  );
}

const TOM_LIMITE = { ok: 'primary', atencao: 'attention', alerta: 'attention', excedido_tolerancia: 'attention', desenquadrado: 'attention' } as const;

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
      <Cabecalho titulo="MEI" subtitulo="Limite de faturamento, DAS, notas e o regime que sai mais barato." />
      <Erro mensagem={painel.erro} onTentar={atualizar} />
      {p && !p.ativo && (
        <Card>
          <p className="body-sm">Você ainda não marcou no perfil que é MEI. O comparador logo abaixo funciona mesmo assim.</p>
          {irParaPerfil && (
            <Button variant="secondary" onClick={irParaPerfil}>
              Abrir perfil
            </Button>
          )}
        </Card>
      )}
      {p && p.ativo && (
        <Card destaque>
          <div className="valor-destaque">
            <span className="overline">Faturamento de {ano}</span>
            <Money cents={p.faturamento.totalCents} size="lg" />
          </div>
          <ProgressBar value={p.limite.usadoPct} label="Uso do limite do MEI" tone={TOM_LIMITE[p.limite.nivel] === 'attention' ? 'attention' : 'primary'} />
          <p className="body-sm">
            <Money cents={p.faturamento.totalCents} size="sm" /> de <Money cents={p.limite.limiteCents} size="sm" /> ({pct(p.limite.usadoPct)}). Ainda
            cabem <Money cents={p.limite.mediaMensalDisponivelCents} size="sm" /> por mês até dezembro.
          </p>
          {p.limite.nivel !== 'ok' ? <Aviso tom="atencao">{p.limite.mensagem}</Aviso> : <p className="caption">{p.limite.mensagem}</p>}
          <div className="card-head">
            <span className="body-sm">
              DAS de <Money cents={p.das.totalCents} size="sm" /> por mês
            </span>
            <OQueE termo="DAS">
              DAS é a guia mensal do MEI. O valor é fixo e já inclui o INSS (que conta para a sua aposentadoria) e o ISS ou ICMS. Vence todo dia 20.
            </OQueE>
          </div>
        </Card>
      )}
      {p?.ativo && (
        <Card titulo="Nota fiscal de serviço">
          <EmitirNota onEmitida={atualizar} />
          <ul className="lista">
            {notas.dados?.notas.map((n) => (
              <li key={n.id} className={n.status === 'cancelada' ? 'apagado' : ''}>
                <Iniciais nome={n.tomadorNome} />
                <div className="item-texto">
                  <span>
                    Nº {n.numero} · {n.tomadorNome}
                  </span>
                  <span className="label">
                    {dataLista(n.emitidaEm)} · {n.descricao}
                  </span>
                  {n.status === 'cancelada' && <Tag>Cancelada</Tag>}
                </div>
                <div className="item-valor">
                  <Money cents={n.valorCents} />
                  {n.status === 'emitida' && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(`Cancelar a nota nº ${n.numero}?`)) void mvp.cancelarNota(n.id).then(atualizar);
                      }}
                    >
                      Cancelar nota
                    </Button>
                  )}
                </div>
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
