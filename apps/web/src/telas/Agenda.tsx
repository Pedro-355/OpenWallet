import { useState, type FormEvent } from 'react';
import type { AvistaOuParcelado } from '@openwallet/tax';
import { dataLista, parseReais, todayISO } from '../format';
import { mvp, type Credito, type ItemAgenda } from '../mvpApi';
import { Button, Chip, Money, OQueE, Tag, formatarReais } from '../ds/componentes';
import { Icone } from '../ds/Icone';
import { Aviso, Cabecalho, Card, Erro, useAcao, useCarregar } from './comum';

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
    await executar(async () =>
      setR((await mvp.avistaOuParcelado({ valorCents: cents, descontoAvistaPct: Number(desconto.replace(',', '.')) || 0, parcelas: Number(parcelas) || 1, rendimentoMensalPct: Number(rende.replace(',', '.')) || 0 })).resultado),
    );
  }

  return (
    <form className="stack" onSubmit={calcular} aria-label="À vista ou parcelado">
      <div className="two">
        <label>
          Valor total (R$)
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="R$ 0,00" />
        </label>
        <label>
          Desconto à vista (%)
          <input inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
        </label>
      </div>
      <div className="two">
        <label>
          Parcelas
          <input type="number" min={1} max={24} value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
        </label>
        <label>
          Quanto seu dinheiro rende (% ao mês)
          <input inputMode="decimal" value={rende} onChange={(e) => setRende(e.target.value)} />
        </label>
      </div>
      <Button variant="ink" type="submit" disabled={ocupado}>
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
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: IPVA do carro" />
      </label>
      <div className="two">
        <label>
          Vencimento
          <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
        </label>
        <label>
          Valor (R$)
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="R$ 0,00" />
        </label>
      </div>
      <Button variant="ink" type="submit" disabled={ocupado || !vencimento}>
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

function Creditos() {
  const lista = useCarregar(() => mvp.creditos());
  const [origem, setOrigem] = useState<Credito['origem']>('restituicao_ir');
  const [valor, setValor] = useState('');
  const { ocupado, erro, executar } = useAcao();
  const previsto = (lista.dados?.creditos ?? []).filter((c) => c.status === 'previsto').reduce((s, c) => s + c.valorCents, 0);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const cents = parseReais(valor);
    if (!cents) return;
    if (await executar(() => mvp.criarCredito({ origem, valorCents: cents }))) {
      setValor('');
      void lista.recarregar();
    }
  }

  return (
    <Card titulo="Dinheiro a receber">
      <div className="valor-destaque">
        <span className="label">A receber</span>
        <Money cents={previsto} size="lg" />
      </div>
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
        <div className="inline">
          <input aria-label="Valor a receber" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="R$ 0,00" />
          <Button variant="ink" type="submit" disabled={ocupado}>
            Adicionar
          </Button>
        </div>
      </form>
      <Erro mensagem={erro || lista.erro} />
      <ul className="lista">
        {lista.dados?.creditos.map((c) => (
          <li key={c.id} className={c.status === 'recebido' ? 'apagado' : ''}>
            <div className="item-texto">
              <span>{ORIGENS[c.origem]}</span>
              <span className="label">{c.status === 'recebido' ? 'Recebido' : c.previstoPara ? `Previsto para ${dataLista(c.previstoPara)}` : 'Previsto'}</span>
            </div>
            <Money cents={c.valorCents} signed={c.status === 'recebido'} />
            {c.status === 'previsto' && (
              <Button variant="secondary" onClick={() => void mvp.marcarCredito(c.id, 'recebido').then(() => lista.recarregar())}>
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

export function Agenda() {
  const ag = useCarregar(() => mvp.agenda());
  const { executar, erro } = useAcao();
  const hoje = todayISO();

  async function alternar(i: ItemAgenda) {
    await executar(async () => {
      if (i.id) await mvp.pagarCompromisso(i.id, !i.pago);
      else await mvp.pagarRecorrente({ tipo: i.tipo, competencia: i.competencia!, vencimento: i.vencimento, pago: !i.pago, valorCents: i.valorCents ?? undefined });
    });
    void ag.recarregar();
  }

  // A explicação de cada tipo aparece só no próximo vencimento em aberto daquele tipo.
  const comExplicacao = new Set<string>();
  for (const i of ag.dados?.itens ?? []) {
    if (!i.pago && !comExplicacao.has(i.tipo)) {
      comExplicacao.add(i.tipo);
      comExplicacao.add(`${i.tipo}|${i.vencimento}`);
    }
  }

  return (
    <div className="page">
      <Cabecalho titulo="Agenda" subtitulo="DAS, carnê-leão, IR, IPVA e IPTU num lugar só." />
      <Card
        titulo="Próximos vencimentos"
        acao={
          ag.dados && ag.dados.itens.length > 0 ? (
            <Button variant="ghost" onClick={() => baixarIcs(ag.dados!.itens)}>
              <Icone nome="calendario" tamanho={18} /> Levar para minha agenda
            </Button>
          ) : undefined
        }
      >
        <Erro mensagem={ag.erro || erro} onTentar={() => void ag.recarregar()} />
        {ag.dados && ag.dados.resumo.atrasados > 0 && (
          <Aviso tom="atencao">
            {ag.dados.resumo.atrasados === 1 ? '1 vencimento passou' : `${ag.dados.resumo.atrasados} vencimentos passaram`}. Se já pagou, é só marcar.
          </Aviso>
        )}
        {ag.dados && ag.dados.itens.length === 0 && (
          <p className="body-sm">Nada por aqui ainda. Ative MEI ou carnê-leão no perfil, ou adicione IPVA e IPTU logo abaixo.</p>
        )}
        <ul className="lista">
          {ag.dados?.itens.map((i) => (
            <li key={`${i.tipo}-${i.competencia ?? i.id}`} className={i.pago ? 'apagado' : ''}>
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
                <Chip selected={i.pago} aria-label={`Pago: ${i.titulo} ${dataLista(i.vencimento, hoje)}`} onClick={() => void alternar(i)}>
                  {i.pago && <Icone nome="check" tamanho={16} />}
                  {i.pago ? 'Pago' : 'Paguei'}
                </Chip>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card titulo="Adicionar IPVA, IPTU ou outro">
        <NovoCompromisso onSalvo={() => void ag.recarregar()} />
      </Card>
      <Card titulo="À vista ou parcelado?">
        <p className="body-sm">Descubra se o desconto à vista vale mais do que deixar o dinheiro rendendo.</p>
        <CalculadoraAvista />
      </Card>
      <Creditos />
      <Pendencias />
    </div>
  );
}
