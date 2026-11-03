import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { parseReais } from '../format';
import { mvp, type Contador, type PerfilFiscal, type RespostaAssistente } from '../mvpApi';
import { Button, Chip, Iniciais, Money, Tag, Toggle } from '../ds/componentes';
import { Icone } from '../ds/Icone';
import { Aviso, Cabecalho, Card, Erro, useAcao, useCarregar } from './comum';

const centsParaTexto = (c: number) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');

function LinhaToggle({ titulo, descricao, checked, onChange }: { titulo: string; descricao: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="linha-toggle">
      <div>
        <span className="title-sm">{titulo}</span>
        <span className="caption">{descricao}</span>
      </div>
      <Toggle checked={checked} onChange={onChange} label={titulo} />
    </div>
  );
}

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
            <option value="clt">Carteira assinada</option>
            <option value="autonomo">Autônomo</option>
            <option value="mei">MEI</option>
            <option value="aposentado">Aposentado</option>
            <option value="outro">Outro</option>
          </select>
        </label>
        <label>
          Renda bruta por mês (R$)
          <input inputMode="decimal" value={renda} onChange={(e) => setRenda(e.target.value)} placeholder="R$ 0,00" />
        </label>
      </div>
      <label>
        Dependentes no IR
        <input type="number" min={0} max={20} value={p.dependentes} onChange={(e) => set('dependentes', Number(e.target.value) || 0)} />
      </label>
      <fieldset>
        <legend>Família</legend>
        <LinhaToggle
          titulo="Família inscrita no CadÚnico"
          descricao="Para saber se vocês recebem o cashback da reforma."
          checked={p.cadunico}
          onChange={(v) => set('cadunico', v)}
        />
        <div className="two">
          <label>
            Pessoas na família
            <input type="number" min={1} max={30} value={p.pessoasFamilia} onChange={(e) => set('pessoasFamilia', Number(e.target.value) || 1)} />
          </label>
          <label>
            Renda da família por mês (R$)
            <input inputMode="decimal" value={rendaFamilia} onChange={(e) => setRendaFamilia(e.target.value)} placeholder="R$ 0,00" />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Obrigações</legend>
        <LinhaToggle titulo="Sou MEI" descricao="Para acompanhar o limite, o DAS e emitir notas." checked={p.mei} onChange={(v) => set('mei', v)} />
        {p.mei && (
          <div className="stack">
            <label>
              Atividade do MEI
              <select value={p.meiAtividade ?? 'servicos'} onChange={(e) => set('meiAtividade', e.target.value as PerfilFiscal['meiAtividade'])}>
                <option value="servicos">Serviços</option>
                <option value="comercio">Comércio ou indústria</option>
                <option value="comercio_servicos">Os dois</option>
              </select>
            </label>
            <label>
              Data de abertura do CNPJ
              <input type="date" value={p.meiAbertura ?? ''} onChange={(e) => set('meiAbertura', e.target.value || null)} />
            </label>
          </div>
        )}
        <LinhaToggle
          titulo="Recebo de pessoa física ou aluguel"
          descricao="Para lembrar do carnê-leão todo mês."
          checked={p.carneLeao}
          onChange={(v) => set('carneLeao', v)}
        />
        <LinhaToggle titulo="Declaro Imposto de Renda" descricao="Para lembrar do prazo da declaração." checked={p.declaraIr} onChange={(v) => set('declaraIr', v)} />
      </fieldset>
      <Button variant="ink" type="submit" disabled={ocupado}>
        Salvar perfil
      </Button>
      {salvo && <Aviso tom="ok">Perfil salvo.</Aviso>}
      <Erro mensagem={erro} />
    </form>
  );
}

interface Mensagem {
  autor: 'voce' | 'assistente';
  texto: ReactNode;
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
            <Chip key={s} onClick={() => void perguntar(s)}>
              {s}
            </Chip>
          ))}
        </div>
      )}
      <ul className="chat" aria-live="polite">
        {conversa.map((m, i) => (
          <li key={i} className={m.autor}>
            <p>{m.texto}</p>
            {m.fontes && m.fontes.length > 0 && <p className="label">Fontes: {m.fontes.map((f) => f.fonte).join('; ')}</p>}
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
        <input aria-label="Sua pergunta" value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="Pergunte sobre impostos" />
        <Button variant="ink" type="submit" disabled={ocupado} aria-label="Perguntar">
          <Icone nome="enviar" tamanho={18} />
        </Button>
      </form>
      <Erro mensagem={erro} />
      <p className="caption">Respostas informativas, com base na lei. Para o seu caso, um contador pode ajudar.</p>
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
      {enviado && <Aviso tom="ok">{enviado}</Aviso>}
      <ul className="lista">
        {lista.dados?.contadores.map((c) => (
          <li key={c.id}>
            <Iniciais nome={c.nome} />
            <div className="item-texto">
              <span>{c.nome}</span>
              <span className="label">
                {c.cidade}, {c.uf} · consulta a partir de <Money cents={c.precoConsultaCents} size="sm" />
              </span>
              <span className="chips">
                {c.exemplo && <Tag tone="attention">Exemplo</Tag>}
                {c.especialidades.slice(0, 2).map((e) => (
                  <Tag key={e}>{e.replace(/_/g, ' ')}</Tag>
                ))}
              </span>
            </div>
            <Button variant="secondary" onClick={() => setAberto(c)}>
              Contatar
            </Button>
          </li>
        ))}
      </ul>
      {aberto && (
        <form className="stack" onSubmit={enviar} aria-label="Pedido de contato">
          <label>
            Mensagem para {aberto.nome}
            <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} minLength={10} />
          </label>
          <Button variant="ink" type="submit" disabled={ocupado || mensagem.trim().length < 10}>
            {mensagem.trim().length < 10 ? 'Escreva sua dúvida para enviar' : 'Enviar pedido'}
          </Button>
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
      <Card titulo="Pergunte sobre impostos">
        <Assistente />
      </Card>
      <Card titulo="Seu perfil">
        <Erro mensagem={perfil.erro} onTentar={() => void perfil.recarregar()} />
        {perfil.dados && (
          <>
            {!perfil.dados.perfil.preenchido && <Aviso>Com o perfil preenchido, a agenda, o IR, o MEI e o cashback ficam do seu jeito.</Aviso>}
            <PerfilForm perfil={perfil.dados.perfil} />
          </>
        )}
      </Card>
      <Contadores />
    </div>
  );
}
