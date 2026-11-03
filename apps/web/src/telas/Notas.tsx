import { useEffect, useRef, useState, type FormEvent } from 'react';
import { brl, dataLista, parseReais } from '../format';
import { mvp } from '../mvpApi';
import { Button, Iniciais, Money, OQueE, Tag } from '../ds/componentes';
import { Icone } from '../ds/Icone';
import { anoCorrente, Aviso, Cabecalho, Card, Erro, useAcao, useCarregar } from './comum';
import { Folha, useFolha } from '../ux/Folha';
import { avisos } from '../ux/avisos';
import { CampoDinheiro } from '../ux/campos';
import { AcaoFixa, Esqueleto, useAoVoltarParaApp, useListaCurta } from '../ux/estrutura';

interface DetectorDeCodigos {
  detect(fonte: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type ConstrutorDetector = new (opts: { formats: string[] }) => DetectorDeCodigos;

/** Câmera + BarcodeDetector (Chrome/Android). Onde não existir, a pessoa cola o link ou digita a chave. */
function LeitorQr({ onLido, autoIniciar = false }: { onLido: (texto: string) => void; autoIniciar?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const aoLer = useRef(onLido);
  aoLer.current = onLido;
  const [ligado, setLigado] = useState(autoIniciar);
  const [erro, setErro] = useState('');
  const Detector = (globalThis as { BarcodeDetector?: ConstrutorDetector }).BarcodeDetector;

  useEffect(() => {
    if (!ligado || !Detector) return;
    let parar = false;
    let stream: MediaStream | null = null;
    const detector = new Detector({ formats: ['qr_code'] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        while (!parar) {
          const achados = await detector.detect(video.current);
          if (achados[0]) {
            aoLer.current(achados[0].rawValue);
            setLigado(false);
            break;
          }
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch {
        setErro('Não deu para abrir a câmera. Você pode colar o link do QR code ou digitar a chave da nota.');
        setLigado(false);
      }
    })();
    return () => {
      parar = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [ligado, Detector]);

  if (!Detector) {
    return <Aviso>Este navegador não lê QR code direto. Abra a câmera do celular, toque no link que aparecer e cole aqui embaixo, ou digite a chave impressa no cupom.</Aviso>;
  }
  return (
    <div className="stack">
      {ligado ? (
        <>
          <video ref={video} className="camera" muted playsInline aria-label="Câmera" />
          <Button variant="secondary" onClick={() => setLigado(false)}>
            Fechar câmera
          </Button>
        </>
      ) : (
        <Button variant="ink" block onClick={() => setLigado(true)}>
          <Icone nome="camera" /> Abrir a câmera
        </Button>
      )}
      {erro && <p className="error">{erro}</p>}
    </div>
  );
}

export function Notas() {
  const ano = anoCorrente();
  const notas = useCarregar(() => mvp.notas());
  const cashback = useCarregar(() => mvp.cashback(ano), [ano]);
  const leitor = useFolha();
  const [texto, setTexto] = useState('');
  const [valor, setValor] = useState('');
  const { ocupado, erro, executar } = useAcao();
  const lista = useListaCurta(notas.dados?.notas ?? [], 6);
  useAoVoltarParaApp(notas.recarregar);

  async function registrar(conteudo: string) {
    const ok = await executar(async () => {
      const r = await mvp.lerNota(conteudo, parseReais(valor) ?? undefined);
      const imposto = r.gastos.reduce((s, g) => s + g.impostoCents, 0);
      avisos.mostrar(`Nota de ${r.nota.emitenteNome} registrada. Cerca de ${brl(imposto)} eram impostos.`);
    });
    if (ok) {
      setTexto('');
      setValor('');
      leitor.fechar();
      void notas.recarregar();
      void cashback.recarregar();
    }
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (texto.trim()) void registrar(texto.trim());
  }

  const c = cashback.dados;
  return (
    <div className="page com-acao">
      <Cabecalho titulo="Notas e cashback" subtitulo="Leia o QR code do cupom e o gasto entra já com o imposto." />

      {!c && cashback.carregando ? (
        <Esqueleto destaque />
      ) : (
        <Card titulo={`Cashback da reforma em ${ano}`}>
          <Erro mensagem={cashback.erro} onTentar={() => void cashback.recarregar()} />
          {c && (
            <>
              <div className="card-head">
                {c.elegibilidade.elegivel ? <Tag tone="positive">Sua família tem direito</Tag> : <Tag>Sem direito pelo perfil</Tag>}
                <OQueE termo="cashback">
                  A partir de 2027, famílias do CadÚnico com renda de até meio salário mínimo por pessoa recebem de volta parte da CBS, o novo imposto
                  federal sobre o consumo. Nas contas de luz, água, gás e telefone, volta 100% da CBS; nas outras compras, 20%.
                </OQueE>
              </div>
              {!c.perfilPreenchido && <Aviso>Para saber se sua família tem direito, que tal preencher o perfil na aba Ajuda?</Aviso>}
              {!c.elegibilidade.elegivel && c.perfilPreenchido && <p className="body-sm">{c.elegibilidade.motivos.join(' ')}</p>}
              <div className="valor-destaque">
                <span className="label">{c.estimativa.vigente ? 'Estimativa de devolução no ano' : 'Quanto voltaria com as regras de 2027'}</span>
                <Money cents={c.estimativa.potencialCents} size="lg" />
                <span className="caption">Estimativa com a CBS em {c.estimativa.aliquotasEstimadas.cbsPct.toLocaleString('pt-BR')}%. A alíquota oficial ainda não saiu.</span>
              </div>
              {c.estimativa.perdidoSemCpfCents > 0 && (
                <Aviso tom="atencao">
                  <Money cents={-c.estimativa.perdidoSemCpfCents} size="sm" signed /> ficariam para trás em compras sem CPF na nota. Que tal pedir o
                  CPF na nota em toda compra?
                </Aviso>
              )}
            </>
          )}
        </Card>
      )}

      <Card titulo="Notas lidas" acao={notas.dados && notas.dados.resumo.total > 0 ? <span className="label">{notas.dados.resumo.total}</span> : undefined}>
        <Erro mensagem={notas.erro} onTentar={() => void notas.recarregar()} />
        {notas.dados && notas.dados.notas.length === 0 && <p className="body-sm">Nenhuma nota ainda. A primeira leva poucos segundos.</p>}
        <ul className="lista">
          {lista.visiveis.map((n) => (
            <li key={n.chave}>
              <Iniciais nome={n.emitenteNome} />
              <div className="item-texto">
                <span>{n.emitenteNome}</span>
                <span className="label">
                  {dataLista(n.emitidaEm)} · {n.uf}
                </span>
              </div>
              <div className="item-valor">
                <Money cents={n.valorCents} />
                {n.cpfNaNota ? <Tag tone="positive">Com CPF</Tag> : n.cpfNaNota === false ? <Tag tone="attention">Sem CPF</Tag> : <Tag>CPF não informado</Tag>}
              </div>
            </li>
          ))}
        </ul>
        {lista.restante > 0 && !lista.todos && (
          <Button variant="secondary" block onClick={lista.verTodos}>
            Ver todas as {notas.dados?.notas.length} notas
          </Button>
        )}
      </Card>

      <AcaoFixa>
        <Button variant="primary" size="lg" block onClick={() => leitor.abrir()}>
          <Icone nome="qr" /> Ler QR code da nota
        </Button>
      </AcaoFixa>

      <Folha aberta={leitor.aberta} onFechar={leitor.fechar} titulo="Registrar nota fiscal" descricao="Aponte a câmera para o QR code no pé do cupom.">
        <LeitorQr onLido={(t) => void registrar(t)} autoIniciar />
        <form className="stack" onSubmit={enviar}>
          <label>
            Ou cole o link do QR code ou a chave de acesso (44 números)
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="https://… ou 3526 1011 2223 …" inputMode="text" enterKeyHint="go" autoComplete="off" autoCapitalize="off" spellCheck={false} />
          </label>
          <CampoDinheiro rotulo="Valor total, se o QR code não trouxer (opcional)" value={valor} onChange={setValor} />
          <Button variant="secondary" type="submit" block disabled={ocupado || !texto.trim()}>
            {ocupado ? 'Registrando…' : texto.trim() ? 'Registrar nota' : 'Cole o link ou a chave para registrar'}
          </Button>
          <Erro mensagem={erro} />
        </form>
      </Folha>
    </div>
  );
}
