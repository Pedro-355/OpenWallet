import { useEffect, useState, type FormEvent } from 'react';
import { brl, parseReais } from '../format';
import { mvp, type Contador, type PerfilFiscal, type RespostaAssistente } from '../mvpApi';
import { Cabecalho, Card, Erro, useAcao, useCarregar } from './comum';

const centsParaTexto = (c: number) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');

export function PerfilForm({ perfil, onSalvo }: { perfil: PerfilFiscal; onSalvo?: (p: PerfilFiscal) => void }) {
  const [p, setP] = useState(perfil);
  const [renda, setRenda] = useState(centsParaTexto(perfil.rendaMensalCents));
  const [rendaFamilia, setRendaFamilia] = useState(centsParaTexto(perfil.rendaFamiliarCents));
  const [salvo, setSalvo] = useState(false);
  const { ocupado, erro, executar } = useAcao();
  useEffect(() => setP(perfil), [perfil]);
  const set = <K extends keyof PerfilFiscal>(k: K, v: PerfilFiscal[K]) => {
    setSalvo(false);
    setP((x) => ({ ...x, [k]: v }));
  };

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const { preenchido: _ignorado, ...dados } = p;
    void _ignorado;
    await executar(async () => {
      const r = await mvp.salvarPerfil({ ...dados, rendaMensalCents: parseReais(renda) ?? 0, rendaFamiliarCents: parseReais(rendaFamilia) ?? 0 });
      setSalvo(true);
      onSalvo?.(r.perfil);
    });
  }

  return (
    <form className="stack" onSubmit={salvar} aria-label="Perfil fiscal">
      <div className="two">
        <label>
          Como você ganha dinheiro
          <select value={p.tipoRenda} onChange={(e) => set('tipoRenda', e.target.value as PerfilFiscal['tipoRenda'])}>
            <option value="clt">Carteira assinada (CLT)</option>
            <option value="autonomo">Autônomo</option>
            <option value="mei">MEI</option>
            <option value="aposentado">Aposentado</option>
            <option value="outro">Outro</option>
          </select>
        </label>
        <label>
          Renda bruta por mês (R$)
          <input inputMode="decimal" value={renda} onChange={(e) => setRenda(e.target.value)} />
        </label>
      </div>
      <label>
        Dependentes no IR
        <input type="number" min={0} max={20} value={p.dependentes} onChange={(e) => set('dependentes', Number(e.target.value) || 0)} />
      </label>
      <fieldset className="stack">
        <legend>Família (para o cashback)</legend>
        <label className="check">
          <input type="checkbox" checked={p.cadunico} onChange={(e) => set('cadunico', e.target.checked)} /> Família inscrita no CadÚnico
        </label>
        <div className="two">
          <label>
            Pessoas na família
            <input type="number" min={1} max={30} value={p.pessoasFamilia} onChange={(e) => set('pessoasFamilia', Number(e.target.value) || 1)} />
          </label>
          <label>
            Renda da família por mês (R$)
            <input inputMode="decimal" value={rendaFamilia} onChange={(e) => setRendaFamilia(e.target.value)} />
          </label>
        </div>
      </fieldset>
      <fieldset className="stack">
        <legend>Obrigações</legend>
        <label className="check">
          <input type="checkbox" checked={p.mei} onChange={(e) => set('mei', e.target.checked)} /> Sou MEI
        </label>
        {p.mei && (
          <div className="two">
            <label>
              Atividade do MEI
              <select value={p.meiAtividade ?? 'servicos'} onChange={(e) => set('meiAtividade', e.target.value as PerfilFiscal['meiAtividade'])}>
                <option value="servicos">Serviços</option>
                <option value="comercio">Comércio/indústria</option>
                <option value="comercio_servicos">Os dois</option>
              </select>
            </label>
            <label>
              Data de abertura do CNPJ
              <input type="date" value={p.meiAbertura ?? ''} onChange={(e) => set('meiAbertura', e.target.value || null)} />
            </label>
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={p.carneLeao} onChange={(e) => set('carneLeao', e.target.checked)} /> Recebo de pessoa física ou aluguel (carnê-leão)
        </label>
        <label className="check">
          <input type="checkbox" checked={p.declaraIr} onChange={(e) => set('declaraIr', e.target.checked)} /> Declaro Imposto de Renda
        </label>
      </fieldset>
      <button className="primary" disabled={ocupado}>
        Salvar perfil
      </button>
      {salvo && <p className="notice ok">Perfil salvo.</p>}
      <Erro mensagem={erro} />
    </form>
  );
}

interface Mensagem {
  autor: 'voce' | 'assistente';
  texto: string;
  fontes?: RespostaAssistente['fontes'];
}

export function Assistente() {
  const [pergunta, setPergunta] = useState('');
  const [conversa, setConversa] = useState<Mensagem[]>([]);
  const { ocupado, erro, executar } = useAcao();
  const sugestoes = ['Preciso declarar o IR?', 'Quanto o MEI pode faturar?', 'Como evitar a malha fina?', 'Quem tem direito ao cashback?'];

  async function perguntar(texto: string) {
    if (texto.trim().length < 3) return;
    setConversa((c) => [...c, { autor: 'voce', texto }]);
    setPergunta('');
    await executar(async () => {
      const r = await mvp.perguntar(texto);
      setConversa((c) => [...c, { autor: 'assistente', texto: r.resposta, fontes: r.fontes }]);
    });
  }

  return (
    <div className="stack">
      {conversa.length === 0 && (
        <div className="chips">
          {sugestoes.map((s) => (
            <button key={s} className="ghost small-btn" onClick={() => void perguntar(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <ul className="chat" aria-live="polite">
        {conversa.map((m, i) => (
          <li key={i} className={m.autor}>
            <p>{m.texto}</p>
            {m.fontes && m.fontes.length > 0 && <p className="muted small">Fontes: {m.fontes.map((f) => f.fonte).join('; ')}</p>}
          </li>
        ))}
      </ul>
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault();
          void perguntar(pergunta);
        }}
      >
        <input aria-label="Sua pergunta" value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="Pergunte sobre impostos…" />
        <button className="primary" disabled={ocupado}>
          {ocupado ? '…' : 'Perguntar'}
        </button>
      </form>
      <Erro mensagem={erro} />
      <p className="muted small">Respostas informativas, com base na lei. Para o seu caso específico, fale com um contador.</p>
    </div>
  );
}

function Contadores() {
  const lista = useCarregar(() => mvp.contadores());
  const [aberto, setAberto] = useState<Contador | null>(null);
  const [mensagem, setMensagem] = useState('');
  const [enviado, setEnviado] = useState('');
  const { ocupado, erro, executar } = useAcao();

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!aberto) return;
    if (await executar(() => mvp.contatar(aberto.id, 'outro', mensagem))) {
      setEnviado(`Pedido enviado para ${aberto.nome}.`);
      setAberto(null);
      setMensagem('');
    }
  }

  return (
    <Card titulo="Falar com um contador">
      <Erro mensagem={lista.erro} />
      {enviado && <p className="notice ok">{enviado}</p>}
      <ul className="lista">
        {lista.dados?.contadores.map((c) => (
          <li key={c.id}>
            <span className="what">
              <span>
                {c.exemplo && <span className="badge">Exemplo</span>}
                {c.nome}
              </span>
              <span className="muted small">
                {c.cidade}/{c.uf} · {c.especialidades.join(', ').replace(/_/g, ' ')} · consulta {brl(c.precoConsultaCents)}
              </span>
            </span>
            <button className="ghost" onClick={() => setAberto(c)}>
              Contatar
            </button>
          </li>
        ))}
      </ul>
      {aberto && (
        <form className="stack" onSubmit={enviar} aria-label="Pedido de contato">
          <label>
            Mensagem para {aberto.nome}
            <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} minLength={10} />
          </label>
          <button className="primary" disabled={ocupado || mensagem.trim().length < 10}>
            Enviar pedido
          </button>
          <Erro mensagem={erro} />
        </form>
      )}
    </Card>
  );
}

export function Ajuda() {
  const perfil = useCarregar(() => mvp.perfil());
  return (
    <div className="page">
      <Cabecalho titulo="Ajuda" subtitulo="Tire dúvidas, ajuste seu perfil ou fale com um contador." />
      <Card titulo="Assistente tributário">
        <Assistente />
      </Card>
      <Card titulo="Seu perfil fiscal">
        <Erro mensagem={perfil.erro} onTentar={() => void perfil.recarregar()} />
        {perfil.dados && (
          <>
            {!perfil.dados.perfil.preenchido && <p className="notice">Preencha para personalizar agenda, IR, MEI e cashback.</p>}
            <PerfilForm perfil={perfil.dados.perfil} />
          </>
        )}
      </Card>
      <Contadores />
    </div>
  );
}
