import { useEffect, useRef, useState, type FormEvent } from 'react';
import { dataLista, parseReais } from '../format';
import { mvp } from '../mvpApi';
import { Button, Iniciais, Money, OQueE, Tag } from '../ds/componentes';
import { Icone } from '../ds/Icone';
import { anoCorrente, Aviso, Cabecalho, Card, Erro, useAcao, useCarregar } from './comum';

interface DetectorDeCodigos {
  detect(fonte: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type ConstrutorDetector = new (opts: { formats: string[] }) => DetectorDeCodigos;

/** Câmera + BarcodeDetector (Chrome/Android). Onde não existir, a pessoa cola o link ou digita a chave. */
function LeitorQr({ onLido }: { onLido: (texto: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const aoLer = useRef(onLido);
  aoLer.current = onLido;
  const [ligado, setLigado] = useState(false);
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
    return <p className="caption">Seu navegador não lê QR code direto. Use a câmera do celular e cole o link aqui embaixo.</p>;
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
        <Button variant="primary" size="lg" block onClick={() => setLigado(true)}>
          <Icone nome="qr" /> Ler QR code da nota
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
  const [texto, setTexto] = useState('');
  const [valor, setValor] = useState('');
  const [resultado, setResultado] = useState<{ loja: string; total: number; imposto: number } | null>(null);
  const { ocupado, erro, executar } = useAcao();

  async function registrar(conteudo: string) {
    setResultado(null);
    const ok = await executar(async () => {
      const r = await mvp.lerNota(conteudo, parseReais(valor) ?? undefined);
      setResultado({ loja: r.nota.emitenteNome, total: r.nota.valorCents, imposto: r.gastos.reduce((s, g) => s + g.impostoCents, 0) });
    });
    if (ok) {
      setTexto('');
      setValor('');
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
    <div className="page">
      <Cabecalho titulo="Notas e cashback" subtitulo="Leia o QR code do cupom e o gasto entra já com o imposto." />

      <Card>
        <LeitorQr onLido={(t) => void registrar(t)} />
        <form className="stack" onSubmit={enviar}>
          <label>
            Link do QR code ou chave de acesso (44 números)
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="https://… ou 3526 1011 2223 …" />
          </label>
          <label>
            Valor total, se o QR code não trouxer (opcional)
            <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="R$ 0,00" />
          </label>
          <Button variant="secondary" type="submit" disabled={ocupado || !texto.trim()}>
            {ocupado ? 'Registrando…' : 'Registrar nota'}
          </Button>
        </form>
        {resultado && (
          <Aviso tom="ok">
            Nota de {resultado.loja} registrada: <Money cents={resultado.total} size="sm" />, dos quais cerca de{' '}
            <Money cents={resultado.imposto} size="sm" /> são impostos.
          </Aviso>
        )}
        <Erro mensagem={erro} />
      </Card>

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
                <Money cents={-c.estimativa.perdidoSemCpfCents} size="sm" signed /> ficariam para trás em compras sem CPF na nota. Que tal pedir
                o CPF na nota em toda compra?
              </Aviso>
            )}
          </>
        )}
      </Card>

      <Card titulo="Notas lidas">
        <Erro mensagem={notas.erro} onTentar={() => void notas.recarregar()} />
        {notas.dados && notas.dados.notas.length === 0 && <p className="body-sm">Nenhuma nota ainda. A primeira leva poucos segundos.</p>}
        <ul className="lista">
          {notas.dados?.notas.map((n) => (
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
      </Card>
    </div>
  );
}
