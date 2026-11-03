import { useState, type FormEvent } from 'react';
import type { IRMensalResultado } from '@openwallet/tax';
import { dataLista, parseReais, pct, todayISO } from '../format';
import { mvp, type Documento, type Rendimento } from '../mvpApi';
import { Button, Chip, Iniciais, Money, OQueE, Tag } from '../ds/componentes';
import { Icone } from '../ds/Icone';
import { anoCorrente, Aviso, Cabecalho, Card, Erro, useAcao, useCarregar } from './comum';

const TIPOS_DOC: Record<Documento['tipo'], string> = {
  saude: 'Saúde',
  educacao: 'Educação',
  previdencia_privada: 'Previdência privada (PGBL)',
  pensao_alimenticia: 'Pensão alimentícia',
  outro: 'Outro',
};
const TIPOS_REND: Record<Rendimento['tipo'], string> = {
  salario: 'Salário (carteira assinada)',
  autonomo_pf: 'Autônomo, pago por pessoa física',
  autonomo_pj: 'Autônomo, pago por empresa',
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
          <input inputMode="decimal" value={bruto} onChange={(e) => setBruto(e.target.value)} placeholder="R$ 0,00" />
        </label>
        <label>
          Dependentes
          <input type="number" min={0} max={20} value={dependentes} onChange={(e) => setDependentes(e.target.value)} />
        </label>
      </div>
      <Button variant="ink" type="submit" disabled={ocupado}>
        Calcular imposto do mês
      </Button>
      <Erro mensagem={erro} />
      {r && (
        <ul className="lista" aria-label="Resultado">
          <li>
            <span className="item-texto">INSS</span>
            <Money cents={-r.inssCents} signed />
          </li>
          <li>
            <span className="item-texto">IR pela tabela</span>
            <Money cents={r.impostoTabelaCents} />
          </li>
          <li>
            <span className="item-texto">
              <span>Redução da Lei 15.270</span>
              <span className="caption">Desde 2026, quem ganha até R$ 5 mil fica isento e quem ganha até R$ 7.350 paga menos.</span>
            </span>
            <Money cents={r.reducaoLei15270Cents} signed />
          </li>
          <li>
            <span className="item-texto">
              <span>IR no mês</span>
              <span className="label">{pct(r.aliquotaEfetivaPct)} do salário</span>
            </span>
            <Money cents={-r.impostoCents} signed />
          </li>
          <li>
            <span className="item-texto">Salário líquido</span>
            <Money cents={r.liquidoCents} />
          </li>
        </ul>
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
      <div className="chips" role="group" aria-label="Tipo de recibo">
        {(Object.keys(TIPOS_DOC) as Documento['tipo'][]).map((k) => (
          <Chip key={k} selected={tipo === k} onClick={() => setTipo(k)}>
            {TIPOS_DOC[k]}
          </Chip>
        ))}
      </div>
      <div className="two">
        <label>
          Valor do recibo (R$)
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="R$ 0,00" />
        </label>
        <label>
          Pago em
          <input type="date" value={pagoEm} onChange={(e) => setPagoEm(e.target.value)} />
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
      <label>
        Para quem (você ou um dependente)
        <input value={beneficiario} onChange={(e) => setBeneficiario(e.target.value)} />
      </label>
      <Button variant="ink" type="submit" disabled={ocupado}>
        Guardar recibo
      </Button>
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
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="R$ 0,00" />
        </label>
      </div>
      <div className="two">
        <label>
          Quem pagou
          <input value={pagador} onChange={(e) => setPagador(e.target.value)} />
        </label>
        <label>
          CPF ou CNPJ de quem pagou
          <input inputMode="numeric" value={doc} onChange={(e) => setDoc(e.target.value)} />
        </label>
      </div>
      <div className="two">
        <label>
          IR retido (R$)
          <input inputMode="decimal" value={ir} onChange={(e) => setIr(e.target.value)} placeholder="R$ 0,00" />
        </label>
        <label>
          INSS descontado (R$)
          <input inputMode="decimal" value={inss} onChange={(e) => setInss(e.target.value)} placeholder="R$ 0,00" />
        </label>
      </div>
      <label>
        Recebido em
        <input type="date" value={recebidoEm} onChange={(e) => setRecebidoEm(e.target.value)} />
      </label>
      <Button variant="ink" type="submit" disabled={ocupado}>
        Guardar rendimento
      </Button>
      <Erro mensagem={erro} />
    </form>
  );
}

const TOM_ALERTA = { alto: 'attention', medio: 'attention', info: 'positive' } as const;
const ROTULO_ALERTA = { alto: 'Risco alto', medio: 'Atenção', info: 'Tudo certo' } as const;

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
      <Cabecalho titulo="Imposto de Renda" subtitulo="Simule, guarde os recibos ao longo do ano e evite a malha fina." />

      <Card titulo="Quanto sai do seu salário?">
        <SimuladorMensal />
      </Card>

      <Card
        destaque
        titulo={`Declaração de ${d?.exercicio ?? ano + 1}`}
      >
        <div className="chips" role="group" aria-label="Ano-base">
          {[anoCorrente() - 1, anoCorrente()].map((a) => (
            <Chip key={a} selected={a === ano} onClick={() => setAno(a)}>
              Ano-base {a}
            </Chip>
          ))}
        </div>
        <Erro mensagem={declaracao.erro} onTentar={() => void declaracao.recarregar()} />
        {d && melhor && (
          <>
            {d.contagem.rendimentos === 0 ? (
              <p className="body-sm">Lance seus rendimentos de {ano} logo abaixo para ver a prévia.</p>
            ) : (
              <div className="valor-destaque">
                <span className="label">{melhor.saldoCents >= 0 ? 'Você deve receber de volta' : 'Você deve pagar'}</span>
                <Money cents={melhor.saldoCents} size="lg" signed />
                <span className="body-sm">
                  A declaração {d.resultado.melhor} sai melhor
                  {d.resultado.vantagemCents > 0 && <> e economiza <Money cents={d.resultado.vantagemCents} size="sm" /></>}.
                </span>
              </div>
            )}
            {!d.resultado.obrigatoriedadeConfirmada && (
              <p className="caption">A Receita ainda não publicou quem é obrigado a declarar em {d.exercicio}. O app usa a regra do ano passado.</p>
            )}
            <div className="card-head">
              <h3>Riscos de malha fina</h3>
              <OQueE termo="malha fina">
                Malha fina é quando a Receita segura a declaração para conferir algo que não bateu com o que empresas, médicos e bancos informaram.
                A restituição atrasa até você explicar ou corrigir.
              </OQueE>
            </div>
            <ul className="lista">
              {d.alertas.map((a) => (
                <li key={a.codigo}>
                  <div className="item-texto">
                    <Tag tone={TOM_ALERTA[a.nivel]}>{ROTULO_ALERTA[a.nivel]}</Tag>
                    <span className="body-sm">{a.mensagem}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card titulo={`Rendimentos de ${ano}`}>
        <NovoRendimento onSalvo={atualizar} />
        <ul className="lista">
          {rends.dados?.rendimentos.map((r) => (
            <li key={r.id}>
              <Iniciais nome={r.pagadorNome || TIPOS_REND[r.tipo]} />
              <div className="item-texto">
                <span>{TIPOS_REND[r.tipo]}</span>
                <span className="label">
                  {dataLista(r.recebidoEm)} · {r.pagadorNome || 'sem fonte pagadora'}
                </span>
              </div>
              <Money cents={r.valorCents} signed />
              <button type="button" className="icon-btn sem-borda" aria-label={`Apagar rendimento de ${dataLista(r.recebidoEm)}`} onClick={() => void mvp.apagarRendimento(r.id).then(atualizar)}>
                <Icone nome="lixeira" tamanho={18} />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card titulo="Pasta de recibos">
        <p className="body-sm">Guarde aqui o que pode abater do imposto: consultas, exames, escola, previdência privada.</p>
        <NovoDocumento onSalvo={atualizar} />
        <ul className="lista">
          {docs.dados?.documentos.map((r) => (
            <li key={r.id}>
              <Iniciais nome={r.prestadorNome} />
              <div className="item-texto">
                <span>{r.prestadorNome}</span>
                <span className="label">
                  {TIPOS_DOC[r.tipo]} · {dataLista(r.pagoEm)}
                </span>
                {!r.prestadorDoc && <Tag tone="attention">Sem CPF ou CNPJ</Tag>}
              </div>
              <Money cents={r.valorCents} />
              <button type="button" className="icon-btn sem-borda" aria-label={`Apagar recibo de ${r.prestadorNome}`} onClick={() => void mvp.apagarDocumento(r.id).then(atualizar)}>
                <Icone nome="lixeira" tamanho={18} />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {d && d.contagem.rendimentos > 0 && <Aviso>As contas são uma prévia. Quem fecha a declaração é você, no programa da Receita.</Aviso>}
    </div>
  );
}
