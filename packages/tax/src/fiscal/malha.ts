/**
 * Checagem de risco de malha fina antes de enviar a declaração.
 * São heurísticas baseadas nos motivos mais comuns de retenção divulgados pela Receita:
 * despesa médica sem comprovação, rendimento omitido, dependente duplicado, carnê-leão esquecido.
 * Não substitui a análise da Receita; serve para a pessoa revisar antes de enviar.
 */
import { cnpjValido, cpfValido } from './nfce.js';

export type TipoRecibo = 'saude' | 'educacao' | 'previdencia_privada' | 'pensao_alimenticia' | 'outro';

export interface ReciboMalha {
  id: string;
  tipo: TipoRecibo;
  valorCents: number;
  /** CPF ou CNPJ de quem recebeu. */
  documentoPrestador: string | null;
  nomePrestador: string;
  beneficiario: string;
}

export interface RendimentoMalha {
  id: string;
  tipo: 'salario' | 'autonomo_pf' | 'autonomo_pj' | 'aluguel' | 'mei' | 'outro';
  valorCents: number;
  /** CPF/CNPJ da fonte pagadora. */
  documentoPagador: string | null;
  irRetidoCents: number;
  /** AAAA-MM do recebimento. */
  mes: string;
}

export interface AlertaMalha {
  nivel: 'alto' | 'medio' | 'info';
  codigo: string;
  mensagem: string;
  /** Itens (recibos/rendimentos) envolvidos. */
  itens: string[];
}

const docValido = (d: string | null) => !!d && (cpfValido(d) || cnpjValido(d));

export function checarMalha(input: {
  recibos: ReciboMalha[];
  rendimentos: RendimentoMalha[];
  /** Meses (AAAA-MM) em que o carnê-leão foi pago. */
  carneLeaoPago: string[];
  dependentes: { nome: string; declaradoPorOutraPessoa?: boolean }[];
}): AlertaMalha[] {
  const alertas: AlertaMalha[] = [];
  const rendTrib = input.rendimentos.reduce((s, r) => s + Math.max(0, r.valorCents), 0);

  const saudeSemDoc = input.recibos.filter((r) => r.tipo === 'saude' && !docValido(r.documentoPrestador));
  if (saudeSemDoc.length) {
    alertas.push({
      nivel: 'alto',
      codigo: 'saude_sem_documento',
      mensagem: 'Despesa médica sem CPF/CNPJ válido do profissional ou clínica. É o motivo nº 1 de malha: peça o recibo completo.',
      itens: saudeSemDoc.map((r) => r.id),
    });
  }

  const saude = input.recibos.filter((r) => r.tipo === 'saude').reduce((s, r) => s + r.valorCents, 0);
  if (rendTrib > 0 && saude > rendTrib * 0.2) {
    alertas.push({
      nivel: 'medio',
      codigo: 'saude_alta',
      mensagem: 'Despesas médicas acima de 20% da renda costumam ser conferidas. Guarde notas e comprovantes de pagamento (Pix/transferência).',
      itens: [],
    });
  }

  // Mesmo recibo lançado duas vezes (mesmo prestador, valor e beneficiário).
  const vistos = new Map<string, string>();
  const duplicados: string[] = [];
  for (const r of input.recibos) {
    const chave = [r.tipo, (r.documentoPrestador ?? r.nomePrestador).replace(/\D/g, '') || r.nomePrestador.toLowerCase(), r.valorCents, r.beneficiario.toLowerCase()].join('|');
    const outro = vistos.get(chave);
    if (outro) duplicados.push(outro, r.id);
    else vistos.set(chave, r.id);
  }
  if (duplicados.length) {
    alertas.push({ nivel: 'medio', codigo: 'recibo_duplicado', mensagem: 'Há recibos que parecem repetidos. Confira antes de declarar.', itens: [...new Set(duplicados)] });
  }

  const semFonte = input.rendimentos.filter((r) => (r.tipo === 'salario' || r.tipo === 'autonomo_pj') && !docValido(r.documentoPagador));
  if (semFonte.length) {
    alertas.push({
      nivel: 'alto',
      codigo: 'rendimento_sem_fonte',
      mensagem: 'Rendimento de empresa sem CNPJ da fonte pagadora. Use o informe de rendimentos: a Receita cruza com a DIRF/eSocial da empresa.',
      itens: semFonte.map((r) => r.id),
    });
  }

  const mesesPF = [...new Set(input.rendimentos.filter((r) => r.tipo === 'autonomo_pf' || r.tipo === 'aluguel').map((r) => r.mes))];
  const semCarne = mesesPF.filter((m) => !input.carneLeaoPago.includes(m)).sort();
  if (semCarne.length) {
    alertas.push({
      nivel: 'medio',
      codigo: 'carne_leao_pendente',
      mensagem: `Recebimentos de pessoa física sem carnê-leão em ${semCarne.length} mês(es). Se havia imposto a pagar, recolha com multa e juros antes de declarar.`,
      itens: semCarne,
    });
  }

  const dupDep = input.dependentes.filter((d) => d.declaradoPorOutraPessoa);
  if (dupDep.length) {
    alertas.push({
      nivel: 'alto',
      codigo: 'dependente_duplicado',
      mensagem: 'Um dependente não pode aparecer em duas declarações (ex.: pai e mãe declarando o mesmo filho). Combinem quem vai incluir.',
      itens: dupDep.map((d) => d.nome),
    });
  }

  const educacaoSemDoc = input.recibos.filter((r) => r.tipo === 'educacao' && !docValido(r.documentoPrestador));
  if (educacaoSemDoc.length) {
    alertas.push({
      nivel: 'medio',
      codigo: 'educacao_sem_documento',
      mensagem: 'Despesa de educação sem CNPJ da escola. Só ensino regular (infantil ao superior e técnico) é dedutível; curso livre e idiomas não.',
      itens: educacaoSemDoc.map((r) => r.id),
    });
  }

  if (!alertas.length) {
    alertas.push({ nivel: 'info', codigo: 'sem_alertas', mensagem: 'Nada chamou atenção nos dados que você lançou.', itens: [] });
  }
  const ordem = { alto: 0, medio: 1, info: 2 };
  return alertas.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}
