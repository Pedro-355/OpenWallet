import { useState, type FormEvent } from 'react';
import type { AvistaOuParcelado } from '@openwallet/tax';
import { brl, parseReais } from '../format';
import { mvp, type Credito, type ItemAgenda } from '../mvpApi';
import { Cabecalho, Card, dataBR, Erro, useAcao, useCarregar } from './comum';

/** Arquivo .ics para levar os vencimentos à agenda do celular (Google Agenda, Apple, Outlook). */
export function gerarIcs(itens: ItemAgenda[]): string {
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OpenWallet//Agenda fiscal//PT-BR', 'CALSCALE:GREGORIAN'];
  for (const i of itens.filter((x) => !x.pago)) {
    const dia = i.vencimento.replace(/-/g, '');
    const uid = `${i.tipo}-${i.competencia ?? i.id ?? dia}@openwallet`;
    const resumo = `${i.titulo}${i.valorCents ? ` — ${brl(i.valorCents)}` : ''}`.replace(/[,;]/g, (c) => `\\${c}`);
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

export function CalculadoraAvista({ inicial }: { inicial?: { valorCents: number; desconto: number; parcelas: number } }) {
  const [valor, setValor] = useState(inicial ? (inicial.valorCents / 100).toFixed(2).replace('.', ',') : '');
  const [desconto, setDesconto] = useState(String(inicial?.desconto ?? 3));
  const [parcelas, setParcelas] = useState(String(inicial?.parcelas ?? 10));
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
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
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
          Seu dinheiro rende (% ao mês)
          <input inputMode="decimal" value={rende} onChange={(e) => setRende(e.target.value)} />
        </label>
      </div>
      <button className="ghost" disabled={ocupado}>
        Comparar
      </button>
      <Erro mensagem={erro} />
      {r && (
        <p className={`notice ${r.recomendacao === 'avista' ? 'ok' : ''}`}>
          <strong>{r.recomendacao === 'avista' ? 'Pague à vista' : r.recomendacao === 'parcelado' ? 'Parcele' : 'Tanto faz'}.</strong> {r.explicacao} À
          vista: {brl(r.avistaCents)} (economia de {brl(r.economiaAvistaCents)}).
        </p>
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
      <div className="two">
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as 'ipva')}>
            <option value="ipva">IPVA</option>
            <option value="iptu">IPTU</option>
            <option value="outro">Outro</option>
          </select>
        </label>
        <label>
          Descrição
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: IPVA do carro" />
        </label>
      </div>
      <div className="two">
        <label>
          Vencimento
          <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
        </label>
        <label>
          Valor (R$)
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        </label>
      </div>
      <button className="ghost" disabled={ocupado || !vencimento}>
        Adicionar à agenda
      </button>
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
      <p className="muted small">A receber: <strong className="accent">{brl(previsto)}</strong></p>
      <form className="two" onSubmit={salvar} aria-label="Novo crédito">
        <select aria-label="Origem" value={origem} onChange={(e) => setOrigem(e.target.value as Credito['origem'])}>
          {Object.entries(ORIGENS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="inline">
          <input aria-label="Valor a receber" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="R$ 0,00" />
          <button className="ghost" disabled={ocupado}>
            +
          </button>
        </div>
      </form>
      <Erro mensagem={erro || lista.erro} />
      <ul className="lista">
        {lista.dados?.creditos.map((c) => (
          <li key={c.id}>
            <span className="what">
              <span>{ORIGENS[c.origem]}</span>
              <span className="muted small">{c.status === 'recebido' ? 'Recebido' : c.previstoPara ? `Previsto para ${dataBR(c.previstoPara)}` : 'Previsto'}</span>
            </span>
            <strong>{brl(c.valorCents)}</strong>
            {c.status === 'previsto' && (
              <button className="ghost" onClick={() => void mvp.marcarCredito(c.id, 'recebido').then(() => lista.recarregar())}>
                Recebi
              </button>
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
      {p.dados && p.dados.pendencias.length === 0 && <p className="muted">Nenhuma pendência encontrada{p.dados.ambiente === 'teste' ? ' (ambiente de teste)' : ''}.</p>}
      <ul className="lista">
        {p.dados?.pendencias.map((x, i) => (
          <li key={i}>
            <span className="what">
              <span>{x.descricao}</span>
              <span className="muted small">{x.orgao} · {x.comoResolver}</span>
            </span>
            <strong className="error">{brl(x.valorCents)}</strong>
          </li>
        ))}
      </ul>
      <p className="muted small">
        Confira também:{' '}
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

  async function alternar(i: ItemAgenda) {
    await executar(async () => {
      if (i.id) await mvp.pagarCompromisso(i.id, !i.pago);
      else await mvp.pagarRecorrente({ tipo: i.tipo, competencia: i.competencia!, vencimento: i.vencimento, pago: !i.pago, valorCents: i.valorCents ?? undefined });
    });
    void ag.recarregar();
  }

  // A dica de cada tipo aparece só no próximo vencimento em aberto daquele tipo.
  const comDica = new Set<string>();
  for (const i of ag.dados?.itens ?? []) {
    if (!i.pago && !comDica.has(i.tipo)) {
      comDica.add(i.tipo);
      comDica.add(`${i.tipo}|${i.vencimento}`);
    }
  }

  return (
    <div className="page">
      <Cabecalho titulo="Agenda fiscal" subtitulo="DAS, carnê-leão, IR, IPVA e IPTU num lugar só." />
      <Card
        titulo="Próximos vencimentos"
        acao={
          ag.dados && ag.dados.itens.length > 0 ? (
            <button className="ghost small-btn" onClick={() => baixarIcs(ag.dados!.itens)}>
              Levar para minha agenda
            </button>
          ) : undefined
        }
      >
        <Erro mensagem={ag.erro || erro} onTentar={() => void ag.recarregar()} />
        {ag.dados && ag.dados.resumo.atrasados > 0 && <p className="notice">{ag.dados.resumo.atrasados} vencimento(s) em atraso.</p>}
        {ag.dados && ag.dados.itens.length === 0 && (
          <p className="muted">Nada por aqui. Ative MEI ou carnê-leão no perfil, ou adicione IPVA e IPTU abaixo.</p>
        )}
        <ul className="lista agenda">
          {ag.dados?.itens.map((i) => (
            <li key={`${i.tipo}-${i.competencia ?? i.id}`} className={i.atrasado ? 'atrasado' : i.pago ? 'pago' : ''}>
              <span className="date">{dataBR(i.vencimento).slice(0, 5)}</span>
              <span className="what">
                <span>
                  {i.titulo}
                  {i.previsto && <span className="badge">previsto</span>}
                </span>
                {comDica.has(`${i.tipo}|${i.vencimento}`) && i.dica && <span className="muted small">{i.dica}</span>}
              </span>
              <span>{i.valorCents ? brl(i.valorCents) : ''}</span>
              <label className="check">
                <input type="checkbox" checked={i.pago} onChange={() => void alternar(i)} aria-label={`Pago: ${i.titulo} ${dataBR(i.vencimento)}`} />
              </label>
            </li>
          ))}
        </ul>
      </Card>
      <Card titulo="Adicionar IPVA, IPTU ou outro">
        <NovoCompromisso onSalvo={() => void ag.recarregar()} />
      </Card>
      <Card titulo="À vista ou parcelado?">
        <CalculadoraAvista />
      </Card>
      <Creditos />
      <Pendencias />
    </div>
  );
}
