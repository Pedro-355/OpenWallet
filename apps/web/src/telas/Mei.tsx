import { useState, type FormEvent } from 'react';
import type { OpcaoRegime } from '@openwallet/tax';
import { dataExtenso, dataLista, parseReais, pct } from '../format';
import { mvp, type NotaMei } from '../mvpApi';
import { Button, Chip, Iniciais, Money, OQueE, ProgressBar, Tag } from '../ds/componentes';
import { anoCorrente, Aviso, Cabecalho, Card, Erro, useAcao, useCarregar } from './comum';
import { Icone } from '../ds/Icone';
import { Folha, useFolha } from '../ux/Folha';
import { avisos } from '../ux/avisos';
import { CampoDinheiro, CampoDocumento, Segmentos, useSegmento } from '../ux/campos';
import { AcaoFixa, Esqueleto, LinhaTocavel } from '../ux/estrutura';

export function Comparador() {
  const [fat, setFat] = useState('');
  const [atividade, setAtividade] = useState<'servicos' | 'comercio'>('servicos');
  const [opcoes, setOpcoes] = useState<OpcaoRegime[] | null>(null);
  const { ocupado, erro, executar } = useAcao();

  async function comparar(e: FormEvent) {
    e.preventDefault();
    const cents = parseReais(fat);
    if (!cents) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    await executar(async () => setOpcoes((await mvp.comparar(cents, atividade)).opcoes));
  }

  return (
    <form className="stack" onSubmit={comparar} aria-label="Comparar regimes">
      <CampoDinheiro rotulo="Faturamento por ano (R$)" value={fat} onChange={setFat} placeholder="90.000" enterKeyHint="go" />
      <div className="chips" role="group" aria-label="Atividade">
        <Chip selected={atividade === 'servicos'} onClick={() => setAtividade('servicos')}>
          Serviços
        </Chip>
        <Chip selected={atividade === 'comercio'} onClick={() => setAtividade('comercio')}>
          Comércio
        </Chip>
      </div>
      <Button variant="ink" size="lg" block type="submit" disabled={ocupado || !parseReais(fat)}>
        {parseReais(fat) ? 'Comparar regimes' : 'Digite o faturamento para comparar'}
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

export function EmitirNota({ onEmitida }: { onEmitida: () => void }) {
  const [tomador, setTomador] = useState('');
  const [doc, setDoc] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const { ocupado, erro, executar } = useAcao();
  const falta = !tomador.trim() ? 'Digite o nome do cliente' : descricao.trim().length < 3 ? 'Descreva o serviço' : !parseReais(valor) ? 'Digite o valor' : '';

  async function emitir(e: FormEvent) {
    e.preventDefault();
    const cents = parseReais(valor);
    if (!cents || !tomador.trim() || descricao.trim().length < 3) return;
    const feito = await executar(async () => {
      const { nota } = await mvp.emitirNota({ tomadorNome: tomador, tomadorDoc: doc.replace(/\D/g, '') || undefined, descricao, valorCents: cents });
      avisos.mostrar(`Nota nº ${nota.numero} emitida${nota.ambiente === 'teste' ? ' (ambiente de teste)' : ''}.`);
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
      <label>
        Cliente
        <input value={tomador} onChange={(e) => setTomador(e.target.value)} autoCapitalize="words" enterKeyHint="next" />
      </label>
      <CampoDocumento rotulo="CPF ou CNPJ do cliente (opcional)" value={doc} onChange={setDoc} />
      <label>
        Serviço prestado
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} autoCapitalize="sentences" enterKeyHint="next" />
      </label>
      <CampoDinheiro rotulo="Valor (R$)" value={valor} onChange={setValor} />
      <Button variant="ink" size="lg" block type="submit" disabled={ocupado || !!falta}>
        {ocupado ? 'Emitindo…' : falta || 'Emitir nota'}
      </Button>
      <Erro mensagem={erro} />
    </form>
  );
}

type Parte = 'painel' | 'notas' | 'comparar';

export function Mei({ irParaPerfil }: { irParaPerfil?: () => void }) {
  const ano = anoCorrente();
  const painel = useCarregar(() => mvp.meiPainel(ano), [ano]);
  const notas = useCarregar(() => mvp.meiNotas(ano), [ano]);
  const [parte, setParte] = useSegmento<Parte>('mei', 'painel');
  const emitir = useFolha();
  const detalhe = useFolha<NotaMei>();
  const [confirmando, setConfirmando] = useState(false);
  const cancelar = useAcao();
  const atualizar = () => {
    void painel.recarregar();
    void notas.recarregar();
  };
  const p = painel.dados;
  const ativo = !!p?.ativo;
  const parteVisivel: Parte = ativo ? parte : 'comparar';

  async function cancelarNota(n: NotaMei) {
    const ok = await cancelar.executar(() => mvp.cancelarNota(n.id));
    if (ok) {
      detalhe.fechar();
      setConfirmando(false);
      avisos.mostrar(`Nota nº ${n.numero} cancelada.`);
      atualizar();
    }
  }

  return (
    <div className={ativo && parteVisivel !== 'comparar' ? 'page com-acao' : 'page'}>
      <Cabecalho titulo="MEI" subtitulo="Limite de faturamento, DAS, notas e o regime que sai mais barato." />
      <Erro mensagem={painel.erro} onTentar={atualizar} />
      {!p && painel.carregando && <Esqueleto destaque />}

      {p && !ativo && (
        <Card>
          <p className="body-sm">Você ainda não marcou no perfil que é MEI. O comparador funciona mesmo assim.</p>
          {irParaPerfil && (
            <Button variant="secondary" onClick={irParaPerfil}>
              Abrir perfil
            </Button>
          )}
        </Card>
      )}

      {ativo && (
        <Segmentos<Parte>
          rotulo="Partes do MEI"
          atual={parteVisivel}
          onTrocar={setParte}
          opcoes={[
            { id: 'painel', rotulo: 'Limite e DAS' },
            { id: 'notas', rotulo: 'Notas' },
            { id: 'comparar', rotulo: 'Comparar regimes' },
          ]}
        />
      )}

      {p && ativo && parteVisivel === 'painel' && (
        <Card destaque>
          <div className="valor-destaque">
            <span className="overline">Faturamento de {ano}</span>
            <Money cents={p.faturamento.totalCents} size="lg" />
          </div>
          <ProgressBar value={p.limite.usadoPct} label="Uso do limite do MEI" tone={p.limite.nivel === 'ok' ? 'primary' : 'attention'} />
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

      {ativo && parteVisivel === 'notas' && (
        <Card titulo={`Notas de ${ano}`}>
          {notas.dados && notas.dados.notas.length === 0 && <p className="body-sm">Nenhuma nota emitida neste ano.</p>}
          <ul className="lista">
            {notas.dados?.notas.map((n) => (
              <LinhaTocavel
                key={n.id}
                rotulo={`Nota nº ${n.numero}, ${n.tomadorNome}`}
                onClick={() => {
                  setConfirmando(false);
                  detalhe.abrir(n);
                }}
              >
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
                <Money cents={n.valorCents} />
              </LinhaTocavel>
            ))}
          </ul>
        </Card>
      )}

      {parteVisivel === 'comparar' && (
        <Card titulo="MEI, Simples ou autônomo?">
          <Comparador />
        </Card>
      )}

      {ativo && parteVisivel !== 'comparar' && (
        <AcaoFixa>
          <Button variant="primary" size="lg" block onClick={() => emitir.abrir()}>
            <Icone nome="mais" /> Emitir nota
          </Button>
        </AcaoFixa>
      )}

      <Folha aberta={emitir.aberta} onFechar={emitir.fechar} titulo="Emitir nota de serviço" descricao="A nota entra no seu faturamento do ano.">
        <EmitirNota
          onEmitida={() => {
            emitir.fechar();
            atualizar();
          }}
        />
      </Folha>

      <Folha aberta={detalhe.aberta} onFechar={detalhe.fechar} titulo={detalhe.dado ? `Nota nº ${detalhe.dado.numero}` : 'Nota'}>
        {detalhe.dado && (
          <>
            <Money cents={detalhe.dado.valorCents} size="lg" />
            <dl className="detalhe">
              <div>
                <dt>Cliente</dt>
                <dd>{detalhe.dado.tomadorNome}</dd>
              </div>
              <div>
                <dt>Serviço</dt>
                <dd>{detalhe.dado.descricao}</dd>
              </div>
              <div>
                <dt>Emitida em</dt>
                <dd>{dataExtenso(detalhe.dado.emitidaEm)}</dd>
              </div>
              <div>
                <dt>Situação</dt>
                <dd>{detalhe.dado.status === 'cancelada' ? <Tag>Cancelada</Tag> : <Tag tone="positive">Emitida</Tag>}</dd>
              </div>
            </dl>
            {detalhe.dado.status === 'emitida' &&
              (confirmando ? (
                <>
                  <Aviso tom="atencao">Cancelar não tem volta: a nota deixa de valer e sai do seu faturamento.</Aviso>
                  <div className="acoes">
                    <Button variant="secondary" onClick={() => setConfirmando(false)}>
                      Manter nota
                    </Button>
                    <Button variant="ink" className="acao-perigosa-forte" disabled={cancelar.ocupado} onClick={() => void cancelarNota(detalhe.dado!)}>
                      Sim, cancelar nº {detalhe.dado.numero}
                    </Button>
                  </div>
                  <Erro mensagem={cancelar.erro} />
                </>
              ) : (
                <Button variant="secondary" block className="acao-perigosa" onClick={() => setConfirmando(true)}>
                  Cancelar nota
                </Button>
              ))}
          </>
        )}
      </Folha>
    </div>
  );
}
