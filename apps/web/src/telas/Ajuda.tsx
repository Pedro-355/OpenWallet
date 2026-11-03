import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { parseReais } from '../format';
import { mvp, type Contador, type PerfilFiscal, type RespostaAssistente } from '../mvpApi';
import { Button, Chip, Iniciais, Money, Tag, Toggle } from '../ds/componentes';
import { Icone } from '../ds/Icone';
import { Aviso, Cabecalho, Card, Erro, useAcao, useCarregar } from './comum';
import { Folha, useFolha } from '../ux/Folha';
import { avisos } from '../ux/avisos';
import { CampoDinheiro, Segmentos, useSegmento } from '../ux/campos';
import { AcaoFixa, Esqueleto } from '../ux/estrutura';

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
  const [mudou, setMudou] = useState(false);
  const { ocupado, erro, executar } = useAcao();
  useEffect(() => setP(perfil), [perfil]);
  const set = <K extends keyof PerfilFiscal>(k: K, v: PerfilFiscal[K]) => {
    setMudou(true);
    setP((x) => ({ ...x, [k]: v }));
  };

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const { preenchido: _ignorado, ...dados } = p;
    void _ignorado;
    (document.activeElement as HTMLElement | null)?.blur?.();
    await executar(async () => {
      const r = await mvp.salvarPerfil({ ...dados, rendaMensalCents: parseReais(renda) ?? 0, rendaFamiliarCents: parseReais(rendaFamilia) ?? 0 });
      setMudou(false);
      avisos.mostrar('Perfil salvo.');
      onSalvo?.(r.perfil);
    });
  }

  return (
    <form id="perfil-fiscal" className="stack" onSubmit={salvar} aria-label="Perfil fiscal" onInput={() => setMudou(true)}>
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
        <CampoDinheiro rotulo="Renda bruta por mês (R$)" value={renda} onChange={setRenda} />
      </div>
      <div className="campo">
        <span className="label">Dependentes no IR</span>
        <div className="chips" role="group" aria-label="Dependentes no IR">
          {[0, 1, 2, 3, 4].map((n) => (
            <Chip key={n} selected={p.dependentes === n || (n === 4 && p.dependentes > 4)} onClick={() => set('dependentes', n)}>
              {n === 4 ? '4 ou mais' : n}
            </Chip>
          ))}
        </div>
      </div>
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
            <input inputMode="numeric" value={p.pessoasFamilia} onChange={(e) => set('pessoasFamilia', Math.min(30, Number(e.target.value.replace(/\D/g, '')) || 1))} />
          </label>
          <CampoDinheiro rotulo="Renda da família por mês (R$)" value={rendaFamilia} onChange={setRendaFamilia} />
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
      <Erro mensagem={erro} />
      {mudou && (
        <AcaoFixa>
          <Button variant="primary" size="lg" block type="submit" form="perfil-fiscal" disabled={ocupado}>
            {ocupado ? 'Salvando…' : 'Salvar perfil'}
          </Button>
        </AcaoFixa>
      )}
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
  const fim = useRef<HTMLLIElement>(null);
  useEffect(() => {
    fim.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [conversa.length, ocupado]);
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
          <li key={i} className={m.autor} ref={i === conversa.length - 1 ? fim : undefined}>
            <p>{m.texto}</p>
            {m.fontes && m.fontes.length > 0 && <p className="label">Fontes: {m.fontes.map((f) => f.fonte).join('; ')}</p>}
          </li>
        ))}
        {ocupado && (
          <li className="assistente" aria-label="Pensando">
            <span className="digitando" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </li>
        )}
      </ul>
      <AcaoFixa>
        <form
          className="inline barra-pergunta"
          onSubmit={(e) => {
            e.preventDefault();
            void perguntar(pergunta);
          }}
        >
          <input aria-label="Sua pergunta" value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="Pergunte sobre impostos" enterKeyHint="send" autoCapitalize="sentences" />
          <Button variant="primary" type="submit" disabled={ocupado || pergunta.trim().length < 3} aria-label="Perguntar">
            <Icone nome="enviar" tamanho={18} />
          </Button>
        </form>
      </AcaoFixa>
      <Erro mensagem={erro} />
      <p className="caption">Respostas informativas, com base na lei. Para o seu caso, um contador pode ajudar.</p>
    </div>
  );
}

function Contadores() {
  const lista = useCarregar(() => mvp.contadores());
  const folha = useFolha<Contador>();
  const aberto = folha.dado;
  const [mensagem, setMensagem] = useState('');
  const { ocupado, erro, executar } = useAcao();

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!aberto) return;
    if (await executar(() => mvp.contatar(aberto.id, 'outro', mensagem))) {
      avisos.mostrar(`Pedido enviado para ${aberto.nome}.`);
      folha.fechar();
      setMensagem('');
    }
  }

  return (
    <Card titulo="Falar com um contador">
      <Erro mensagem={lista.erro} />
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
            <Button variant="secondary" onClick={() => folha.abrir(c)}>
              Contatar
            </Button>
          </li>
        ))}
      </ul>
      <Folha aberta={folha.aberta} onFechar={folha.fechar} titulo={aberto ? `Falar com ${aberto.nome}` : 'Falar com um contador'} descricao="Conte em poucas palavras o que você precisa. A resposta chega pelo app.">
        {aberto && (
          <form className="stack" onSubmit={enviar} aria-label="Pedido de contato">
            <label>
              Sua mensagem
              <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={4} minLength={10} autoCapitalize="sentences" placeholder="Ex.: Caí na malha fina por causa de um recibo médico." />
            </label>
            <Button variant="ink" size="lg" block type="submit" disabled={ocupado || mensagem.trim().length < 10}>
              {mensagem.trim().length < 10 ? 'Escreva sua dúvida para enviar' : 'Enviar pedido'}
            </Button>
            <Erro mensagem={erro} />
          </form>
        )}
      </Folha>
    </Card>
  );
}

type Parte = 'perguntar' | 'perfil' | 'contadores';

export function Ajuda() {
  const perfil = useCarregar(() => mvp.perfil());
  const [parte, setParte] = useSegmento<Parte>('ajuda', 'perguntar');
  return (
    <div className={parte === 'contadores' ? 'page' : 'page com-acao'}>
      <Cabecalho titulo="Ajuda" subtitulo="Tire dúvidas, ajuste seu perfil ou fale com um contador." />
      <Segmentos<Parte>
        rotulo="Partes da ajuda"
        atual={parte}
        onTrocar={setParte}
        opcoes={[
          { id: 'perguntar', rotulo: 'Perguntar' },
          { id: 'perfil', rotulo: 'Seu perfil', contador: perfil.dados && !perfil.dados.perfil.preenchido ? 1 : 0 },
          { id: 'contadores', rotulo: 'Contadores' },
        ]}
      />
      {parte === 'perguntar' && (
        <Card titulo="Pergunte sobre impostos">
          <Assistente />
        </Card>
      )}
      {parte === 'perfil' && (
        <Card titulo="Seu perfil">
          <Erro mensagem={perfil.erro} onTentar={() => void perfil.recarregar()} />
          {!perfil.dados && perfil.carregando && <Esqueleto linhas={4} />}
          {perfil.dados && (
            <>
              {!perfil.dados.perfil.preenchido && <Aviso>Com o perfil preenchido, a agenda, o IR, o MEI e o cashback ficam do seu jeito.</Aviso>}
              <PerfilForm perfil={perfil.dados.perfil} />
            </>
          )}
        </Card>
      )}
      {parte === 'contadores' && <Contadores />}
    </div>
  );
}
