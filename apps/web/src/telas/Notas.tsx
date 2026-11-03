import { useEffect, useRef, useState, type FormEvent } from 'react';
import { brl, parseReais } from '../format';
import { mvp } from '../mvpApi';
import { anoCorrente, Cabecalho, Card, dataBR, Erro, useAcao, useCarregar } from './comum';

interface DetectorDeCodigos {
  detect(fonte: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type ConstrutorDetector = new (opts: { formats: string[] }) => DetectorDeCodigos;

/** Câmera + BarcodeDetector (Chrome/Android). Onde não existir, a pessoa cola o código ou digita a chave. */
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
        setErro('Não consegui abrir a câmera. Cole o link do QR code ou digite a chave da nota.');
        setLigado(false);
      }
    })();
    return () => {
      parar = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [ligado, Detector]);

  if (!Detector) return <p className="muted small">Seu navegador não lê QR code direto: use o leitor da câmera e cole o link abaixo.</p>;
  return (
    <div className="stack">
      {ligado ? (
        <>
          <video ref={video} className="camera" muted playsInline aria-label="Câmera" />
          <button className="ghost" onClick={() => setLigado(false)}>
            Fechar câmera
          </button>
        </>
      ) : (
        <button className="primary" onClick={() => setLigado(true)}>
          📷 Ler QR code da nota
        </button>
      )}
      {erro && <p className="error small">{erro}</p>}
    </div>
  );
}

export function Notas() {
  const ano = anoCorrente();
  const notas = useCarregar(() => mvp.notas());
  const cashback = useCarregar(() => mvp.cashback(ano), [ano]);
  const [texto, setTexto] = useState('');
  const [valor, setValor] = useState('');
  const [resultado, setResultado] = useState('');
  const { ocupado, erro, executar } = useAcao();

  async function registrar(conteudo: string) {
    setResultado('');
    const ok = await executar(async () => {
      const r = await mvp.lerNota(conteudo, parseReais(valor) ?? undefined);
      const imposto = r.gastos.reduce((s, g) => s + g.impostoCents, 0);
      setResultado(`Nota de ${r.nota.emitenteNome} registrada: ${brl(r.nota.valorCents)}, dos quais ≈ ${brl(imposto)} são impostos.`);
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
      <Cabecalho titulo="Notas e cashback" subtitulo="Leia o QR code do cupom: o gasto entra com o imposto e conta para o cashback." />

      <Card titulo="Registrar nota fiscal">
        <div className="stack">
          <LeitorQr onLido={(t) => void registrar(t)} />
          <form className="stack" onSubmit={enviar}>
            <label>
              Link do QR code ou chave de acesso (44 números)
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="https://… ou 3526 1011 2223 …" />
            </label>
            <label>
              Valor total (opcional — o QR code nem sempre traz)
              <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
            </label>
            <button className="ghost" disabled={ocupado || !texto.trim()}>
              {ocupado ? 'Registrando…' : 'Registrar nota'}
            </button>
          </form>
          {resultado && <p className="notice ok">{resultado}</p>}
          <Erro mensagem={erro} />
        </div>
      </Card>

      <Card titulo={`Cashback da reforma (${ano})`}>
        <Erro mensagem={cashback.erro} onTentar={() => void cashback.recarregar()} />
        {c && (
          <div className="stack">
            {!c.perfilPreenchido && <p className="notice">Preencha o perfil (aba Ajuda) para saber se sua família tem direito.</p>}
            <p>
              {c.elegibilidade.elegivel ? (
                <strong className="accent">Sua família tem direito ao cashback.</strong>
              ) : (
                <span>Pelo seu perfil, hoje sua família não tem direito. {c.elegibilidade.motivos.join(' ')}</span>
              )}
            </p>
            <p className="big-sm">{brl(c.estimativa.potencialCents)}</p>
            <p className="muted small">
              {c.estimativa.vigente ? 'Estimativa de devolução no ano' : 'Simulação: quanto voltaria com as regras de 2027'} · CBS estimada em{' '}
              {c.estimativa.aliquotasEstimadas.cbsPct.toLocaleString('pt-BR')}%
            </p>
            {c.estimativa.perdidoSemCpfCents > 0 && (
              <p className="notice">
                {brl(c.estimativa.perdidoSemCpfCents)} ficariam para trás por compras sem CPF na nota. Peça CPF na nota em toda compra.
              </p>
            )}
          </div>
        )}
      </Card>

      <Card titulo="Notas lidas">
        <Erro mensagem={notas.erro} onTentar={() => void notas.recarregar()} />
        {notas.dados && notas.dados.notas.length === 0 && <p className="muted">Nenhuma nota ainda.</p>}
        <ul className="lista">
          {notas.dados?.notas.map((n) => (
            <li key={n.chave}>
              <span className="what">
                <span>{n.emitenteNome}</span>
                <span className="muted small">
                  {dataBR(n.emitidaEm)} · {n.uf} · {n.cpfNaNota ? 'com CPF' : n.cpfNaNota === false ? 'sem CPF' : 'CPF não informado'}
                </span>
              </span>
              <strong>{brl(n.valorCents)}</strong>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
