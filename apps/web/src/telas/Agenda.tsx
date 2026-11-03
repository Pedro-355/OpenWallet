import { useState, type FormEvent } from 'react';
import type { AvistaOuParcelado } from '@openwallet/tax';
import { dataLista, parseReais, todayISO } from '../format';
import { mvp, type Credito, type ItemAgenda } from '../mvpApi';
import { Button, Chip, Money, OQueE, Tag, formatarReais } from '../ds/componentes';
import { Icone } from '../ds/Icone';
import { Aviso, Cabecalho, Card, Erro, useAcao, useCarregar } from './comum';
import { Folha, useFolha } from '../ux/Folha';
import { avisos } from '../ux/avisos';
import { CampoDinheiro, Segmentos, useSegmento } from '../ux/campos';
import { AcaoFixa, Esqueleto, useAoVoltarParaApp } from '../ux/estrutura';

/** Arquivo .ics para levar os vencimentos à agenda do celular (Google Agenda, Apple, Outlook). */
export function gerarIcs(itens: ItemAgenda[]): string {
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OpenWallet//Agenda fiscal//PT-BR', 'CALSCALE:GREGORIAN'];
  for (const i of itens.filter((x) => !x.pago)) {
    const dia = i.vencimento.replace(/-/g, '');
    const uid = `${i.tipo}-${i.competencia ?? i.id ?? dia}@openwallet`;
    const resumo = `${i.titulo}${i.valorCents ? ` — ${formatarReais(i.valorCents / 100)}` : ''}`.replace(/[,;]/g, (c) => `\\${c}`);
    linhas.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${dia}T120000Z`, `DTSTART;VALUE=DATE:${dia}`, `SUMMARY:${resumo}`,
      'BEGIN:VALARM', 'TRIGGER:-P2D', 'ACTION:DISPLAY', `DESCRIPTION:${resumo}`, 'END:VALARM', 'END:VEVENT');
  }
  linhas.push('END:VCALENDAR');
  return linhas.join('\r\n');
}

function baixarIcs(itens: ItemAgenda[]) {
  const url = URL.createObjectURL(new Blob([gerarIcs(itens)], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'openwallet-agenda.ics';
  a.click();
  URL.revokeObjectURL(url);
}

/** Explicação curta de cada obrigação, mostrada em "O que é isso?". */
const O_QUE_E: Record<string, string> = {
  das_mei: 'DAS é a guia mensal do MEI. Junta o INSS (que conta para a sua aposentadoria) e o ISS ou ICMS num valor fixo.',
  carne_leao: 'Carnê-leão é o imposto de renda pago todo mês por quem recebe de pessoa física, como aluguel ou consulta particular.',
  dasn_simei: 'DASN-SIMEI é a declaração anual do MEI: você informa quanto faturou no ano anterior.',
  dirpf: 'É a declaração anual do Imposto de Renda da pessoa física. O prazo oficial sai no começo do ano.',
};

export function CalculadoraAvista() {
  const [valor, setValor] = useState('');
  const [desconto, setDesconto] = useState('3');
  const [parcelas, setParcelas] = useState('10');
  const [rende, setRende] = useState('1');
  const [r, setR] = useState<AvistaOuParcelado | null>(null);
  const { ocupado, erro, executar } = useAcao();

  async function calcular(e: FormEvent) {
    e.preventDefault();
    const cents = parseReais(valor);
    if (!cents) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    await executar(async () =>
      setR((await mvp.avistaOuParcelado({ valorCents: cents, descontoAvistaPct: Number(desconto.replace(',', '.')) || 0, parcelas: Number(parcelas) || 1, rendimentoMensalPct: Number(rende.replace(',', '.')) || 0 })).resultado),
    );
  }

  return (
    <form className="stack" onSubmit={calcular} aria-label="À vista ou parcelado">
      <CampoDinheiro rotulo="Valor total (R$)" value={valor} onChange={setValor} />
      <div className="two">
        <label>
          Desconto à vista (%)
          <input inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} enterKeyHint="next" />
        </label>
        <label>
          Parcelas
          <input inputMode="numeric" value={parcelas} onChange={(e) => setParcelas(e.target.value.replace(/\D/g, '').slice(0, 2))} enterKeyHint="next" />
        </label>
      </div>
      <label>
        Quanto seu dinheiro rende (% ao mês)
        <input inputMode="decimal" value={rende} onChange={(e) => setRende(e.target.value)} enterKeyHint="go" />
      </label>
      <Button variant="ink" size="lg" block type="submit" disabled={ocupado}>
        Comparar as duas opções
      </Button>
      <Erro mensagem={erro} />
      {r && (
        <div className="stack">
          <Tag tone={r.recomendacao === 'avista' ? 'positive' : r.recomendacao === 'parcelado' ? 'primary' : 'neutral'}>
            {r.recomendacao === 'avista' ? 'À vista sai melhor' : r.recomendacao === 'parcelado' ? 'Parcelar sai melhor' : 'Tanto faz'}
          </Tag>
          <p className="body-sm">{r.explicacao}</p>
          <p className="body-sm">
            À vista: <Money cents={r.avistaCents} size="sm" />, economia de <Money cents={r.economiaAvistaCents} size="sm" signed />. A decisão é sua.
          </p>
        </div>
      )}
    </form>
  );
}

function NovoCompromisso({ onSalvo }: { onSalvo: () => void }) {
  const [tipo, setTipo] = useState<'ipva' | 'iptu' | 'outro'>('ipva');
  const [titulo, setTitulo] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [valor, setValor] = useState('');
  const { ocupado, erro, executar } = useAcao();

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!vencimento) return;
    const ok = await executar(() =>
      mvp.criarCompromisso({ tipo, titulo: titulo || tipo.toUpperCase(), vencimento, valorCents: parseReais(valor) ?? undefined }),
    );
    if (ok) {
      setTitulo('');
      setValor('');
      setVencimento('');
      onSalvo();
    }
  }

  return (
    <form className="stack" onSubmit={salvar} aria-label="Novo compromisso">
      <div className="chips" role="group" aria-label="Tipo">
        {(['ipva', 'iptu', 'outro'] as const).map((t) => (
          <Chip key={t} selected={tipo === t} onClick={() => setTipo(t)}>
            {t === 'outro' ? 'Outro' : t.toUpperCase()}
          </Chip>
        ))}
      </div>
      <label>
        Descrição
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: IPVA do carro" autoCapitalize="sentences" enterKeyHint="next" />
      </label>
      <div className="two">
        <label>
          Vencimento
          <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
        </label>
        <CampoDinheiro rotulo="Valor (R$)" value={valor} onChange={setValor} />
      </div>
      <Button variant="ink" size="lg" block type="submit" disabled={ocupado || !vencimento}>
        {vencimento ? 'Adicionar à agenda' : 'Escolha o vencimento'}
      </Button>
      <Erro mensagem={erro} />
    </form>
  );
}

const ORIGENS: Record<Credito['origem'], string> = {
  restituicao_ir: 'Restituição do IR',
  nota_fiscal_estadual: 'Programa de nota fiscal do estado',
  valores_a_receber: 'Valores a receber (Banco Central)',
  cashback: 'Cashback da reforma',
  outro: 'Outro',
};

function NovoCredito({ onSalvo }: { onSalvo: () => void }) {
  const [origem, setOrigem] = useState<Credito['origem']>('restituicao_ir');
  const [valor, setValor] = useState('');
  const [quando, setQuando] = useState('');
  const { ocupado, erro, executar } = useAcao();

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const cents = parseReais(valor);
    if (!cents) return;
    if (await executar(() => mvp.criarCredito({ origem, valorCents: cents, previstoPara: quando || null }))) {
      setValor('');
      onSalvo();
    }
  }

  return (
    <form className="stack" onSubmit={salvar} aria-label="Novo crédito">
      <label>
        De onde vem
        <select value={origem} onChange={(e) => setOrigem(e.target.value as Credito['origem'])}>
          {Object.entries(ORIGENS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <div className="two">
        <CampoDinheiro rotulo="Valor a receber" value={valor} onChange={setValor} />
        <label>
          Previsto para (opcional)
          <input type="date" value={quando} onChange={(e) => setQuando(e.target.value)} />
        </label>
      </div>
      <Button variant="ink" size="lg" block type="submit" disabled={ocupado || !parseReais(valor)}>
        {parseReais(valor) ? 'Adicionar' : 'Digite o valor a receber'}
      </Button>
      <Erro mensagem={erro} />
    </form>
  );
}

function Creditos({ lista }: { lista: ReturnType<typeof useCarregar<{ creditos: Credito[] }>> }) {
  const [recebidos, setRecebidos] = useState<Set<string>>(new Set());
  const itens = (lista.dados?.creditos ?? []).map((c) => (recebidos.has(c.id) ? { ...c, status: 'recebido' as const } : c));
  const previsto = itens.filter((c) => c.status === 'previsto').reduce((s, c) => s + c.valorCents, 0);

  function receber(c: Credito) {
    setRecebidos((r) => new Set(r).add(c.id)); // na hora; o servidor confirma em seguida
    mvp
      .marcarCredito(c.id, 'recebido')
      .then(() => {
        avisos.mostrar(`${ORIGENS[c.origem]} marcada como recebida.`);
        void lista.recarregar();
      })
      .catch(() => {
        setRecebidos((r) => {
          const n = new Set(r);
          n.delete(c.id);
          return n;
        });
        avisos.mostrar('Não deu para salvar. Tente de novo.', { tom: 'erro' });
      });
  }

  return (
    <Card titulo="Dinheiro a receber">
      <div className="valor-destaque">
        <span className="label">A receber</span>
        <Money cents={previsto} size="lg" />
      </div>
      <Erro mensagem={lista.erro} />
      {itens.length === 0 && !lista.carregando && <p className="body-sm">Restituição, Nota Fiscal Paulista, valores esquecidos no banco: anote aqui para não perder de vista.</p>}
      <ul className="lista">
        {itens.map((c) => (
          <li key={c.id} className={c.status === 'recebido' ? 'apagado' : ''}>
            <div className="item-texto">
              <span>{ORIGENS[c.origem]}</span>
              <span className="label">{c.status === 'recebido' ? 'Recebido' : c.previstoPara ? `Previsto para ${dataLista(c.previstoPara)}` : 'Previsto'}</span>
            </div>
            <Money cents={c.valorCents} signed={c.status === 'recebido'} />
            {c.status === 'previsto' && (
              <Button variant="secondary" onClick={() => receber(c)}>
                Recebi
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Pendencias() {
  const p = useCarregar(() => mvp.pendencias());
  return (
    <Card titulo="Pendências com o Fisco">
      <Erro mensagem={p.erro} />
      {p.dados && p.dados.pendencias.length === 0 && (
        <Aviso tom="ok">Nenhuma pendência encontrada{p.dados.ambiente === 'teste' ? ' (ambiente de teste)' : ''}.</Aviso>
      )}
      <ul className="lista">
        {p.dados?.pendencias.map((x, i) => (
          <li key={i}>
            <div className="item-texto">
              <span>{x.descricao}</span>
              <span className="caption">
                {x.orgao} · {x.comoResolver}
              </span>
            </div>
            <Money cents={-x.valorCents} signed />
          </li>
        ))}
      </ul>
      <p className="caption">
        Vale conferir também:{' '}
        {p.dados?.ondeConferir.map((l, i) => (
          <span key={l.url}>
            {i > 0 && ' · '}
            <a href={l.url} target="_blank" rel="noreferrer">
              {l.nome}
            </a>
          </span>
        ))}
      </p>
    </Card>
  );
}

type Parte = 'vencimentos' | 'receber' | 'calcular';

export function Agenda() {
  const ag = useCarregar(() => mvp.agenda());
  const creditos = useCarregar(() => mvp.creditos());
  const [parte, setParte] = useSegmento<Parte>('agenda', 'vencimentos');
  const novo = useFolha<'compromisso' | 'credito'>();
  // "Paguei" muda na hora; se o servidor recusar, volta e avisa.
  const [pagosLocal, setPagosLocal] = useState<Map<string, boolean>>(new Map());
  const hoje = todayISO();
  useAoVoltarParaApp(ag.recarregar);

  const chave = (i: ItemAgenda) => `${i.tipo}-${i.competencia ?? i.id}`;
  const itens = (ag.dados?.itens ?? []).map((i) => (pagosLocal.has(chave(i)) ? { ...i, pago: pagosLocal.get(chave(i))!, atrasado: pagosLocal.get(chave(i)) ? false : i.atrasado } : i));
  const atrasados = itens.filter((i) => i.atrasado).length;

  async function salvarPago(i: ItemAgenda, pago: boolean) {
    if (i.id) await mvp.pagarCompromisso(i.id, pago);
    else await mvp.pagarRecorrente({ tipo: i.tipo, competencia: i.competencia!, vencimento: i.vencimento, pago, valorCents: i.valorCents ?? undefined });
  }

  function alternar(i: ItemAgenda) {
    const pago = !i.pago;
    const k = chave(i);
    setPagosLocal((m) => new Map(m).set(k, pago));
    salvarPago(i, pago)
      .then(() => {
        if (pago) {
          avisos.mostrar(`${i.titulo} marcado como pago.`, {
            acao: {
              rotulo: 'Desfazer',
              fn: () => {
                setPagosLocal((m) => new Map(m).set(k, false));
                void salvarPago(i, false);
              },
            },
          });
        }
      })
      .catch(() => {
        setPagosLocal((m) => new Map(m).set(k, !pago));
        avisos.mostrar('Não deu para salvar. Tente de novo.', { tom: 'erro' });
      });
  }

  // A explicação de cada tipo aparece só no próximo vencimento em aberto daquele tipo.
  const comExplicacao = new Set<string>();
  for (const i of itens) {
    if (!i.pago && !comExplicacao.has(i.tipo)) {
      comExplicacao.add(i.tipo);
      comExplicacao.add(`${i.tipo}|${i.vencimento}`);
    }
  }

  return (
    <div className={parte === 'calcular' ? 'page' : 'page com-acao'}>
      <Cabecalho titulo="Agenda" subtitulo="DAS, carnê-leão, IR, IPVA e IPTU num lugar só." />

      <Segmentos<Parte>
        rotulo="Partes da agenda"
        atual={parte}
        onTrocar={setParte}
        opcoes={[
          { id: 'vencimentos', rotulo: 'Vencimentos', contador: atrasados },
          { id: 'receber', rotulo: 'A receber' },
          { id: 'calcular', rotulo: 'À vista ou parcelado?' },
        ]}
      />

      {parte === 'vencimentos' && (
        <>
          {!ag.dados && ag.carregando ? (
            <Esqueleto linhas={5} />
          ) : (
            <Card
              titulo="Próximos vencimentos"
              acao={
                itens.length > 0 ? (
                  <Button variant="ghost" onClick={() => baixarIcs(itens)} aria-label="Levar para a agenda do celular">
                    <Icone nome="calendario" tamanho={18} /> Levar para o celular
                  </Button>
                ) : undefined
              }
            >
              <Erro mensagem={ag.erro} onTentar={() => void ag.recarregar()} />
              {atrasados > 0 && (
                <Aviso tom="atencao">
                  {atrasados === 1 ? '1 vencimento passou' : `${atrasados} vencimentos passaram`}. Se já pagou, é só marcar.
                </Aviso>
              )}
              {ag.dados && itens.length === 0 && (
                <p className="body-sm">Nada por aqui ainda. Ative MEI ou carnê-leão no perfil, ou adicione IPVA e IPTU.</p>
              )}
              <ul className="lista">
                {itens.map((i) => (
                  <li key={chave(i)} className={i.pago ? 'apagado' : ''}>
                    <span className={`item-data${i.atrasado ? ' atrasado' : ''}`}>{dataLista(i.vencimento, hoje)}</span>
                    <div className="item-texto">
                      <span>{i.titulo}</span>
                      <span>
                        {i.atrasado && <Tag tone="attention">Venceu</Tag>} {i.previsto && <Tag>Data prevista</Tag>}
                      </span>
                      {comExplicacao.has(`${i.tipo}|${i.vencimento}`) && O_QUE_E[i.tipo] && <OQueE termo={i.titulo}>{O_QUE_E[i.tipo]}</OQueE>}
                    </div>
                    <div className="item-valor">
                      {i.valorCents ? <Money cents={i.valorCents} /> : null}
                      <Chip selected={i.pago} aria-label={`Pago: ${i.titulo} ${dataLista(i.vencimento, hoje)}`} onClick={() => alternar(i)}>
                        {i.pago && <Icone nome="check" tamanho={16} />}
                        {i.pago ? 'Pago' : 'Paguei'}
                      </Chip>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Pendencias />
        </>
      )}

      {parte === 'receber' && <Creditos lista={creditos} />}

      {parte === 'calcular' && (
        <Card titulo="À vista ou parcelado?">
          <p className="body-sm">Descubra se o desconto à vista vale mais do que deixar o dinheiro rendendo.</p>
          <CalculadoraAvista />
        </Card>
      )}

      {parte === 'vencimentos' && (
        <AcaoFixa>
          <Button variant="primary" size="lg" block onClick={() => novo.abrir('compromisso')}>
            <Icone nome="mais" /> Adicionar IPVA, IPTU ou outro
          </Button>
        </AcaoFixa>
      )}
      {parte === 'receber' && (
        <AcaoFixa>
          <Button variant="primary" size="lg" block onClick={() => novo.abrir('credito')}>
            <Icone nome="mais" /> Anotar valor a receber
          </Button>
        </AcaoFixa>
      )}

      <Folha aberta={novo.dado === 'compromisso'} onFechar={novo.fechar} titulo="Novo compromisso" descricao="O app avisa quando estiver chegando.">
        <NovoCompromisso
          onSalvo={() => {
            novo.fechar();
            avisos.mostrar('Adicionado à agenda.');
            void ag.recarregar();
          }}
        />
      </Folha>
      <Folha aberta={novo.dado === 'credito'} onFechar={novo.fechar} titulo="Valor a receber">
        <NovoCredito
          onSalvo={() => {
            novo.fechar();
            avisos.mostrar('Anotado.');
            void creditos.recarregar();
          }}
        />
      </Folha>
    </div>
  );
}
