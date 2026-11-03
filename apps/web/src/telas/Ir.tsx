import { useState, type FormEvent } from 'react';
import type { IRMensalResultado } from '@openwallet/tax';
import { brl, parseReais, pct, todayISO } from '../format';
import { mvp, type Documento, type Rendimento } from '../mvpApi';
import { anoCorrente, Cabecalho, Card, dataBR, Erro, useAcao, useCarregar } from './comum';

const TIPOS_DOC: Record<Documento['tipo'], string> = {
  saude: 'Saúde',
  educacao: 'Educação',
  previdencia_privada: 'Previdência privada (PGBL)',
  pensao_alimenticia: 'Pensão alimentícia',
  outro: 'Outro',
};
const TIPOS_REND: Record<Rendimento['tipo'], string> = {
  salario: 'Salário (CLT)',
  autonomo_pf: 'Autônomo — pago por pessoa física',
  autonomo_pj: 'Autônomo — pago por empresa',
  aluguel: 'Aluguel',
  mei: 'Faturamento do MEI',
  outro: 'Outro',
};

export function SimuladorMensal() {
  const [bruto, setBruto] = useState('');
  const [dependentes, setDependentes] = useState('0');
  const [r, setR] = useState<IRMensalResultado | null>(null);
  const { ocupado, erro, executar } = useAcao();

  async function simular(e: FormEvent) {
    e.preventDefault();
    const cents = parseReais(bruto);
    if (!cents) return;
    await executar(async () => setR((await mvp.simularMensal({ brutoCents: cents, dependentes: Number(dependentes) || 0 })).resultado));
  }

  return (
    <form className="stack" onSubmit={simular}>
      <div className="two">
        <label>
          Salário bruto (R$)
          <input inputMode="decimal" value={bruto} onChange={(e) => setBruto(e.target.value)} placeholder="0,00" />
        </label>
        <label>
          Dependentes
          <input type="number" min={0} max={20} value={dependentes} onChange={(e) => setDependentes(e.target.value)} />
        </label>
      </div>
      <button className="primary" disabled={ocupado}>
        Calcular
      </button>
      <Erro mensagem={erro} />
      {r && (
        <dl className="contas" aria-label="Resultado">
          <dt>INSS</dt>
          <dd>{brl(r.inssCents)}</dd>
          <dt>IR pela tabela</dt>
          <dd>{brl(r.impostoTabelaCents)}</dd>
          <dt>Redução da Lei 15.270</dt>
          <dd>− {brl(r.reducaoLei15270Cents)}</dd>
          <dt>
            <strong>IR no mês</strong>
          </dt>
          <dd>
            <strong>{brl(r.impostoCents)}</strong> ({pct(r.aliquotaEfetivaPct)})
          </dd>
          <dt>Líquido</dt>
          <dd>{brl(r.liquidoCents)}</dd>
        </dl>
      )}
    </form>
  );
}

function NovoDocumento({ onSalvo }: { onSalvo: () => void }) {
  const [tipo, setTipo] = useState<Documento['tipo']>('saude');
  const [valor, setValor] = useState('');
  const [pagoEm, setPagoEm] = useState(todayISO());
  const [prestador, setPrestador] = useState('');
  const [doc, setDoc] = useState('');
  const [beneficiario, setBeneficiario] = useState('Titular');
  const { ocupado, erro, executar } = useAcao();

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const cents = parseReais(valor);
    if (!cents || !prestador.trim()) return;
    const ok = await executar(() =>
      mvp.criarDocumento({ tipo, valorCents: cents, pagoEm, prestadorNome: prestador, prestadorDoc: doc || null, beneficiario }),
    );
    if (ok) {
      setValor('');
      setPrestador('');
      setDoc('');
      onSalvo();
    }
  }

  return (
    <form className="stack" onSubmit={salvar} aria-label="Novo recibo">
      <div className="two">
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as Documento['tipo'])}>
            {Object.entries(TIPOS_DOC).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Valor do recibo (R$)
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
        </label>
      </div>
      <div className="two">
        <label>
          Quem recebeu (profissional, clínica, escola)
          <input value={prestador} onChange={(e) => setPrestador(e.target.value)} />
        </label>
        <label>
          CPF ou CNPJ de quem recebeu
          <input inputMode="numeric" value={doc} onChange={(e) => setDoc(e.target.value)} />
        </label>
      </div>
      <div className="two">
        <label>
          Pago em
          <input type="date" value={pagoEm} onChange={(e) => setPagoEm(e.target.value)} />
        </label>
        <label>
          Para quem (titular ou dependente)
          <input value={beneficiario} onChange={(e) => setBeneficiario(e.target.value)} />
        </label>
      </div>
      <button className="ghost" disabled={ocupado}>
        Guardar recibo
      </button>
      <Erro mensagem={erro} />
    </form>
  );
}

function NovoRendimento({ onSalvo }: { onSalvo: () => void }) {
  const [tipo, setTipo] = useState<Rendimento['tipo']>('salario');
  const [valor, setValor] = useState('');
  const [recebidoEm, setRecebidoEm] = useState(todayISO());
  const [pagador, setPagador] = useState('');
  const [doc, setDoc] = useState('');
  const [ir, setIr] = useState('');
  const [inss, setInss] = useState('');
  const { ocupado, erro, executar } = useAcao();

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const cents = parseReais(valor);
    if (!cents) return;
    const ok = await executar(() =>
      mvp.criarRendimento({
        tipo, valorCents: cents, recebidoEm, pagadorNome: pagador, pagadorDoc: doc || null,
        irRetidoCents: parseReais(ir) ?? 0, inssCents: parseReais(inss) ?? 0,
      }),
    );
    if (ok) {
      setValor('');
      setIr('');
      setInss('');
      onSalvo();
    }
  }

  return (
    <form className="stack" onSubmit={salvar} aria-label="Novo rendimento">
      <div className="two">
        <label>
          Tipo de rendimento
          <select value={tipo} onChange={(e) => setTipo(e.target.value as Rendimento['tipo'])}>
            {Object.entries(TIPOS_REND).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Valor bruto recebido (R$)
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
        </label>
      </div>
      <div className="two">
        <label>
          Quem pagou
          <input value={pagador} onChange={(e) => setPagador(e.target.value)} />
        </label>
        <label>
          CPF/CNPJ de quem pagou
          <input inputMode="numeric" value={doc} onChange={(e) => setDoc(e.target.value)} />
        </label>
      </div>
      <div className="two">
        <label>
          IR retido (R$)
          <input inputMode="decimal" value={ir} onChange={(e) => setIr(e.target.value)} placeholder="0,00" />
        </label>
        <label>
          INSS descontado (R$)
          <input inputMode="decimal" value={inss} onChange={(e) => setInss(e.target.value)} placeholder="0,00" />
        </label>
      </div>
      <label>
        Recebido em
        <input type="date" value={recebidoEm} onChange={(e) => setRecebidoEm(e.target.value)} />
      </label>
      <button className="ghost" disabled={ocupado}>
        Guardar rendimento
      </button>
      <Erro mensagem={erro} />
    </form>
  );
}

export function Ir() {
  const [ano, setAno] = useState(anoCorrente());
  const declaracao = useCarregar(() => mvp.declaracao(ano), [ano]);
  const docs = useCarregar(() => mvp.documentos(ano), [ano]);
  const rends = useCarregar(() => mvp.rendimentos(ano), [ano]);
  const atualizar = () => {
    void declaracao.recarregar();
    void docs.recarregar();
    void rends.recarregar();
  };
  const d = declaracao.dados;
  const melhor = d ? d.resultado[d.resultado.melhor] : null;

  return (
    <div className="page">
      <Cabecalho titulo="Imposto de Renda" subtitulo="Simule, guarde recibos ao longo do ano e evite a malha fina." />

      <Card titulo="Quanto vou pagar por mês?">
        <SimuladorMensal />
      </Card>

      <Card
        titulo={`Prévia da declaração ${(d?.exercicio ?? ano + 1)} (ano-base ${ano})`}
        acao={
          <select aria-label="Ano-base" value={ano} onChange={(e) => setAno(Number(e.target.value))} className="mini">
            {[anoCorrente(), anoCorrente() - 1].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        }
      >
        <Erro mensagem={declaracao.erro} onTentar={() => void declaracao.recarregar()} />
        {d && melhor && (
          <div className="stack">
            {d.contagem.rendimentos === 0 ? (
              <p className="muted">Lance seus rendimentos abaixo para ver a prévia.</p>
            ) : (
              <>
                <p className="big-sm">
                  {melhor.saldoCents >= 0 ? (
                    <>
                      <span className="accent">{brl(melhor.saldoCents)}</span> a restituir
                    </>
                  ) : (
                    <>
                      <span className="error">{brl(-melhor.saldoCents)}</span> a pagar
                    </>
                  )}
                </p>
                <p className="muted small">
                  Melhor opção: declaração {d.resultado.melhor}
                  {d.resultado.vantagemCents > 0 && ` (economia de ${brl(d.resultado.vantagemCents)})`}. Rendimentos tributáveis:{' '}
                  {brl(d.entrada.rendimentosTributaveisCents)}.
                </p>
                {!d.resultado.obrigatoriedadeConfirmada && (
                  <p className="muted small">O limite de obrigatoriedade de {d.exercicio} ainda não foi publicado pela Receita.</p>
                )}
              </>
            )}
            <h3>Riscos de malha fina</h3>
            <ul className="alertas">
              {d.alertas.map((a) => (
                <li key={a.codigo} className={`alerta ${a.nivel}`}>
                  {a.mensagem}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card titulo="Rendimentos do ano">
        <NovoRendimento onSalvo={atualizar} />
        <ul className="lista">
          {rends.dados?.rendimentos.map((r) => (
            <li key={r.id}>
              <span className="what">
                <span>{TIPOS_REND[r.tipo]}</span>
                <span className="muted small">
                  {dataBR(r.recebidoEm)} · {r.pagadorNome || 'sem fonte pagadora'}
                </span>
              </span>
              <strong>{brl(r.valorCents)}</strong>
              <button className="ghost icon" aria-label={`Apagar rendimento de ${dataBR(r.recebidoEm)}`} onClick={() => void mvp.apagarRendimento(r.id).then(atualizar)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card titulo="Pasta de recibos dedutíveis">
        <NovoDocumento onSalvo={atualizar} />
        <ul className="lista">
          {docs.dados?.documentos.map((r) => (
            <li key={r.id}>
              <span className="what">
                <span>{r.prestadorNome}</span>
                <span className="muted small">
                  {TIPOS_DOC[r.tipo]} · {dataBR(r.pagoEm)} · {r.prestadorDoc ? 'com CPF/CNPJ' : 'sem CPF/CNPJ'}
                </span>
              </span>
              <strong>{brl(r.valorCents)}</strong>
              <button className="ghost icon" aria-label={`Apagar recibo de ${r.prestadorNome}`} onClick={() => void mvp.apagarDocumento(r.id).then(atualizar)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
