import { useState, type FormEvent } from 'react';
import type { IRMensalResultado } from '@openwallet/tax';
import { dataExtenso, dataLista, parseReais, pct, todayISO } from '../format';
import { mvp, type Documento, type Rendimento } from '../mvpApi';
import { Button, Chip, Iniciais, Money, OQueE, Tag } from '../ds/componentes';
import { Icone } from '../ds/Icone';
import { anoCorrente, Aviso, Cabecalho, Card, Erro, useAcao, useCarregar } from './comum';
import { Folha, useFolha } from '../ux/Folha';
import { avisos, comDesfazer } from '../ux/avisos';
import { CampoDinheiro, CampoDocumento, Segmentos, useSegmento } from '../ux/campos';
import { AcaoFixa, Esqueleto, LinhaTocavel } from '../ux/estrutura';

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
  const [dependentes, setDependentes] = useState(0);
  const [r, setR] = useState<IRMensalResultado | null>(null);
  const { ocupado, erro, executar } = useAcao();

  async function simular(e: FormEvent) {
    e.preventDefault();
    const cents = parseReais(bruto);
    if (!cents) return;
    (document.activeElement as HTMLElement | null)?.blur?.(); // fecha o teclado para mostrar o resultado
    await executar(async () => setR((await mvp.simularMensal({ brutoCents: cents, dependentes })).resultado));
  }

  return (
    <form className="stack" onSubmit={simular}>
      <CampoDinheiro rotulo="Salário bruto (R$)" value={bruto} onChange={setBruto} enterKeyHint="go" />
      <div className="campo">
        <span className="label">Dependentes</span>
        <div className="chips" role="group" aria-label="Dependentes">
          {[0, 1, 2, 3, 4].map((n) => (
            <Chip key={n} selected={dependentes === n} onClick={() => setDependentes(n)}>
              {n === 4 ? '4 ou mais' : n}
            </Chip>
          ))}
        </div>
      </div>
      <Button variant="ink" size="lg" block type="submit" disabled={ocupado || !parseReais(bruto)}>
        {parseReais(bruto) ? 'Calcular imposto do mês' : 'Digite o salário para calcular'}
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
  const falta = !parseReais(valor) ? 'Digite o valor do recibo' : !prestador.trim() ? 'Digite quem recebeu' : '';

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const cents = parseReais(valor);
    if (!cents || !prestador.trim()) return;
    const ok = await executar(() =>
      mvp.criarDocumento({ tipo, valorCents: cents, pagoEm, prestadorNome: prestador, prestadorDoc: doc.replace(/\D/g, '') || null, beneficiario }),
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
      <CampoDinheiro rotulo="Valor do recibo (R$)" value={valor} onChange={setValor} />
      <label>
        Quem recebeu (profissional, clínica, escola)
        <input value={prestador} onChange={(e) => setPrestador(e.target.value)} autoCapitalize="words" enterKeyHint="next" />
      </label>
      <CampoDocumento
        rotulo="CPF ou CNPJ de quem recebeu"
        value={doc}
        onChange={setDoc}
        dica={tipo === 'saude' ? 'Sem ele, a despesa médica é o motivo nº 1 de malha fina.' : undefined}
      />
      <div className="two">
        <label>
          Pago em
          <input type="date" value={pagoEm} max={todayISO()} onChange={(e) => setPagoEm(e.target.value)} />
        </label>
        <label>
          Para quem
          <input value={beneficiario} onChange={(e) => setBeneficiario(e.target.value)} autoCapitalize="words" enterKeyHint="done" />
        </label>
      </div>
      <Button variant="ink" size="lg" block type="submit" disabled={ocupado || !!falta}>
        {ocupado ? 'Guardando…' : falta || 'Guardar recibo'}
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
        tipo, valorCents: cents, recebidoEm, pagadorNome: pagador, pagadorDoc: doc.replace(/\D/g, '') || null,
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
      <CampoDinheiro rotulo="Valor bruto recebido (R$)" value={valor} onChange={setValor} />
      <label>
        Quem pagou
        <input value={pagador} onChange={(e) => setPagador(e.target.value)} autoCapitalize="words" enterKeyHint="next" />
      </label>
      <CampoDocumento rotulo="CPF ou CNPJ de quem pagou" value={doc} onChange={setDoc} dica="Está no informe de rendimentos." />
      <div className="two">
        <CampoDinheiro rotulo="IR retido (R$)" value={ir} onChange={setIr} />
        <CampoDinheiro rotulo="INSS descontado (R$)" value={inss} onChange={setInss} />
      </div>
      <label>
        Recebido em
        <input type="date" value={recebidoEm} max={todayISO()} onChange={(e) => setRecebidoEm(e.target.value)} />
      </label>
      <Button variant="ink" size="lg" block type="submit" disabled={ocupado || !parseReais(valor)}>
        {ocupado ? 'Guardando…' : parseReais(valor) ? 'Guardar rendimento' : 'Digite o valor recebido'}
      </Button>
      <Erro mensagem={erro} />
    </form>
  );
}

const TOM_ALERTA = { alto: 'attention', medio: 'attention', info: 'positive' } as const;
const ROTULO_ALERTA = { alto: 'Risco alto', medio: 'Atenção', info: 'Tudo certo' } as const;

type Parte = 'resumo' | 'rendimentos' | 'recibos' | 'simular';
type Item = { tipo: 'rendimento'; r: Rendimento } | { tipo: 'recibo'; d: Documento };

export function Ir() {
  const [ano, setAno] = useState(anoCorrente());
  const [parte, setParte] = useSegmento<Parte>('ir', 'resumo');
  const declaracao = useCarregar(() => mvp.declaracao(ano), [ano]);
  const docs = useCarregar(() => mvp.documentos(ano), [ano]);
  const rends = useCarregar(() => mvp.rendimentos(ano), [ano]);
  const novo = useFolha<'rendimento' | 'recibo'>();
  const detalhe = useFolha<Item>();
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const atualizar = () => {
    void declaracao.recarregar();
    void docs.recarregar();
    void rends.recarregar();
  };
  const d = declaracao.dados;
  const melhor = d ? d.resultado[d.resultado.melhor] : null;
  const riscos = d?.alertas.filter((a) => a.nivel !== 'info').length ?? 0;
  const rendimentos = (rends.dados?.rendimentos ?? []).filter((r) => !ocultos.has(r.id));
  const recibos = (docs.dados?.documentos ?? []).filter((x) => !ocultos.has(x.id));

  function apagar(item: Item) {
    detalhe.fechar();
    const id = item.tipo === 'rendimento' ? item.r.id : item.d.id;
    comDesfazer({
      texto: item.tipo === 'rendimento' ? 'Rendimento apagado.' : 'Recibo apagado.',
      aoAgendar: () => setOcultos((o) => new Set(o).add(id)),
      aoDesfazer: () =>
        setOcultos((o) => {
          const n = new Set(o);
          n.delete(id);
          return n;
        }),
      executar: async () => {
        await (item.tipo === 'rendimento' ? mvp.apagarRendimento(id) : mvp.apagarDocumento(id));
        atualizar();
      },
    });
  }

  const salvo = (texto: string) => () => {
    novo.fechar();
    avisos.mostrar(texto);
    atualizar();
  };

  return (
    <div className={parte === 'rendimentos' || parte === 'recibos' ? 'page com-acao' : 'page'}>
      <Cabecalho titulo="Imposto de Renda" subtitulo="Simule, guarde os recibos ao longo do ano e evite a malha fina." />

      <Segmentos<Parte>
        rotulo="Partes do Imposto de Renda"
        atual={parte}
        onTrocar={setParte}
        opcoes={[
          { id: 'resumo', rotulo: 'Resumo', contador: riscos },
          { id: 'rendimentos', rotulo: 'Rendimentos' },
          { id: 'recibos', rotulo: 'Recibos' },
          { id: 'simular', rotulo: 'Simular salário' },
        ]}
      />

      {parte === 'resumo' && (
        <>
          {!d && declaracao.carregando ? (
            <Esqueleto destaque linhas={4} />
          ) : (
            <Card destaque titulo={`Declaração de ${d?.exercicio ?? ano + 1}`}>
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
                    <>
                      <p className="body-sm">Lance seus rendimentos de {ano} para ver quanto vai receber de volta ou pagar.</p>
                      <Button variant="ink" onClick={() => setParte('rendimentos')}>
                        Lançar rendimentos
                      </Button>
                    </>
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
                </>
              )}
            </Card>
          )}
          {d && (
            <Card titulo="Riscos de malha fina">
              <OQueE termo="malha fina">
                Malha fina é quando a Receita segura a declaração para conferir algo que não bateu com o que empresas, médicos e bancos informaram.
                A restituição atrasa até você explicar ou corrigir.
              </OQueE>
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
            </Card>
          )}
          {d && d.contagem.rendimentos > 0 && <Aviso>As contas são uma prévia. Quem fecha a declaração é você, no programa da Receita.</Aviso>}
        </>
      )}

      {parte === 'rendimentos' && (
        <Card titulo={`Rendimentos de ${ano}`}>
          {rendimentos.length === 0 && !rends.carregando && <p className="body-sm">Nenhum rendimento lançado. O informe de rendimentos da empresa traz todos os números.</p>}
          <ul className="lista">
            {rendimentos.map((r) => (
              <LinhaTocavel key={r.id} rotulo={`${TIPOS_REND[r.tipo]}, ${dataLista(r.recebidoEm)}`} onClick={() => detalhe.abrir({ tipo: 'rendimento', r })}>
                <Iniciais nome={r.pagadorNome || TIPOS_REND[r.tipo]} />
                <div className="item-texto">
                  <span>{TIPOS_REND[r.tipo]}</span>
                  <span className="label">
                    {dataLista(r.recebidoEm)} · {r.pagadorNome || 'sem fonte pagadora'}
                  </span>
                </div>
                <Money cents={r.valorCents} signed />
              </LinhaTocavel>
            ))}
          </ul>
        </Card>
      )}

      {parte === 'recibos' && (
        <Card titulo="Pasta de recibos">
          <p className="body-sm">Guarde aqui o que pode abater do imposto: consultas, exames, escola, previdência privada.</p>
          <ul className="lista">
            {recibos.map((r) => (
              <LinhaTocavel key={r.id} rotulo={`Recibo de ${r.prestadorNome}`} onClick={() => detalhe.abrir({ tipo: 'recibo', d: r })}>
                <Iniciais nome={r.prestadorNome} />
                <div className="item-texto">
                  <span>{r.prestadorNome}</span>
                  <span className="label">
                    {TIPOS_DOC[r.tipo]} · {dataLista(r.pagoEm)}
                  </span>
                  {!r.prestadorDoc && <Tag tone="attention">Sem CPF ou CNPJ</Tag>}
                </div>
                <Money cents={r.valorCents} />
              </LinhaTocavel>
            ))}
          </ul>
        </Card>
      )}

      {parte === 'simular' && (
        <Card titulo="Quanto sai do seu salário?">
          <SimuladorMensal />
        </Card>
      )}

      {parte === 'rendimentos' && (
        <AcaoFixa>
          <Button variant="primary" size="lg" block onClick={() => novo.abrir('rendimento')}>
            <Icone nome="mais" /> Adicionar rendimento
          </Button>
        </AcaoFixa>
      )}
      {parte === 'recibos' && (
        <AcaoFixa>
          <Button variant="primary" size="lg" block onClick={() => novo.abrir('recibo')}>
            <Icone nome="mais" /> Guardar recibo
          </Button>
        </AcaoFixa>
      )}

      <Folha aberta={novo.dado === 'rendimento'} onFechar={novo.fechar} titulo="Novo rendimento" descricao="Os números estão no informe de rendimentos ou no holerite.">
        <NovoRendimento onSalvo={salvo('Rendimento guardado.')} />
      </Folha>
      <Folha aberta={novo.dado === 'recibo'} onFechar={novo.fechar} titulo="Novo recibo" descricao="Guarde também o comprovante do pagamento (Pix ou transferência).">
        <NovoDocumento onSalvo={salvo('Recibo guardado.')} />
      </Folha>

      <Folha
        aberta={detalhe.aberta}
        onFechar={detalhe.fechar}
        titulo={detalhe.dado?.tipo === 'rendimento' ? TIPOS_REND[detalhe.dado.r.tipo] : detalhe.dado?.tipo === 'recibo' ? detalhe.dado.d.prestadorNome : ''}
      >
        {detalhe.dado?.tipo === 'rendimento' && (
          <>
            <Money cents={detalhe.dado.r.valorCents} size="lg" signed />
            <dl className="detalhe">
              <div>
                <dt>Recebido em</dt>
                <dd>{dataExtenso(detalhe.dado.r.recebidoEm)}</dd>
              </div>
              <div>
                <dt>Quem pagou</dt>
                <dd>{detalhe.dado.r.pagadorNome || 'Não informado'}</dd>
              </div>
              <div>
                <dt>IR retido</dt>
                <dd>
                  <Money cents={detalhe.dado.r.irRetidoCents ?? 0} size="sm" />
                </dd>
              </div>
              <div>
                <dt>INSS descontado</dt>
                <dd>
                  <Money cents={detalhe.dado.r.inssCents ?? 0} size="sm" />
                </dd>
              </div>
            </dl>
          </>
        )}
        {detalhe.dado?.tipo === 'recibo' && (
          <>
            <Money cents={detalhe.dado.d.valorCents} size="lg" />
            <dl className="detalhe">
              <div>
                <dt>Tipo</dt>
                <dd>{TIPOS_DOC[detalhe.dado.d.tipo]}</dd>
              </div>
              <div>
                <dt>Pago em</dt>
                <dd>{dataExtenso(detalhe.dado.d.pagoEm)}</dd>
              </div>
              <div>
                <dt>CPF ou CNPJ</dt>
                <dd>{detalhe.dado.d.prestadorDoc ?? <Tag tone="attention">Não informado</Tag>}</dd>
              </div>
              <div>
                <dt>Para quem</dt>
                <dd>{detalhe.dado.d.beneficiario ?? 'Titular'}</dd>
              </div>
            </dl>
          </>
        )}
        {detalhe.dado && (
          <Button variant="secondary" block className="acao-perigosa" onClick={() => apagar(detalhe.dado!)}>
            <Icone nome="lixeira" tamanho={18} /> {detalhe.dado.tipo === 'rendimento' ? 'Apagar rendimento' : 'Apagar recibo'}
          </Button>
        )}
      </Folha>
    </div>
  );
}
