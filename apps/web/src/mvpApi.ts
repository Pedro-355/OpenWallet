/** Cliente das funcionalidades do MVP (perfil, notas, IR, agenda, MEI, cashback, assistente). */
import type {
  AlertaMalha, AvistaOuParcelado, EstimativaCashback, Elegibilidade, IRAnualResultado, IRMensalResultado, ImpostometroAnual,
  OpcaoRegime, StatusLimiteMei,
} from '@openwallet/tax';
import { call } from './api';

export interface PerfilFiscal {
  tipoRenda: 'clt' | 'autonomo' | 'mei' | 'aposentado' | 'outro';
  rendaMensalCents: number;
  dependentes: number;
  cadunico: boolean;
  pessoasFamilia: number;
  rendaFamiliarCents: number;
  mei: boolean;
  meiAtividade: 'comercio' | 'servicos' | 'comercio_servicos' | null;
  meiAbertura: string | null;
  carneLeao: boolean;
  declaraIr: boolean;
  preenchido: boolean;
}

export interface NotaLida {
  chave: string;
  uf: string;
  emitenteNome: string;
  emitidaEm: string;
  valorCents: number;
  cpfNaNota: boolean | null;
}

export interface ItemAgenda {
  id: string | null;
  origem: 'automatica' | 'manual';
  tipo: string;
  titulo: string;
  vencimento: string;
  competencia: string | null;
  valorCents: number | null;
  pago: boolean;
  previsto: boolean;
  dica: string;
  atrasado: boolean;
  descontoAvistaPct: number | null;
  parcelas: number | null;
}

export interface Documento {
  id: string;
  tipo: 'saude' | 'educacao' | 'previdencia_privada' | 'pensao_alimenticia' | 'outro';
  valorCents: number;
  pagoEm: string;
  prestadorNome: string;
  prestadorDoc: string | null;
  beneficiario: string | null;
}

export interface Rendimento {
  id: string;
  tipo: 'salario' | 'autonomo_pf' | 'autonomo_pj' | 'aluguel' | 'mei' | 'outro';
  valorCents: number;
  recebidoEm: string;
  pagadorNome: string | null;
  pagadorDoc: string | null;
  irRetidoCents: number | null;
  inssCents: number | null;
}

export interface Credito {
  id: string;
  origem: 'restituicao_ir' | 'nota_fiscal_estadual' | 'valores_a_receber' | 'cashback' | 'outro';
  descricao: string | null;
  valorCents: number;
  previstoPara: string | null;
  status: 'previsto' | 'recebido';
}

export interface NotaMei {
  id: string;
  numero: number;
  tomadorNome: string;
  descricao: string;
  valorCents: number;
  emitidaEm: string;
  status: 'emitida' | 'cancelada';
  ambiente: 'teste' | 'producao';
}

export interface Declaracao {
  ano: number;
  exercicio: number;
  entrada: { rendimentosTributaveisCents: number; impostoPagoCents: number };
  resultado: IRAnualResultado;
  alertas: AlertaMalha[];
  contagem: { rendimentos: number; recibos: number };
}

export interface Contador {
  id: string;
  nome: string;
  crc: string;
  uf: string;
  cidade: string;
  especialidades: string[];
  precoConsultaCents: number;
  atendeOnline: boolean;
  exemplo: boolean;
}

export interface RespostaAssistente {
  resposta: string;
  fontes: { id: string; fonte: string; titulo: string }[];
  modo: 'modelo' | 'busca';
  aviso: string;
}

export interface Pendencia {
  orgao: string;
  descricao: string;
  valorCents: number;
  situacao: string;
  comoResolver: string;
}

export const mvp = {
  perfil: () => call<{ perfil: PerfilFiscal }>('GET', '/v1/perfil-fiscal'),
  salvarPerfil: (p: Partial<PerfilFiscal>) => call<{ perfil: PerfilFiscal }>('PUT', '/v1/perfil-fiscal', p),

  lerNota: (texto: string, valorCents?: number) =>
    call<{ nota: NotaLida; gastos: { categoria: string; valorCents: number; impostoCents: number }[] }>('POST', '/v1/notas/ler', {
      texto,
      ...(valorCents ? { valorCents } : {}),
    }),
  notas: () => call<{ notas: NotaLida[]; resumo: { total: number; semCpf: number } }>('GET', '/v1/notas'),
  cashback: (ano: number) =>
    call<{ elegibilidade: Elegibilidade; estimativa: EstimativaCashback; perfilPreenchido: boolean; gastosConsiderados: number }>('GET', `/v1/cashback?ano=${ano}`),
  impostometroAnual: (ano: number) => call<ImpostometroAnual & { estimado: boolean }>('GET', `/v1/impostometro/anual?ano=${ano}`),

  simularMensal: (b: { brutoCents: number; dependentes?: number; tipo?: 'clt' | 'autonomo' }) =>
    call<{ resultado: IRMensalResultado }>('POST', '/v1/ir/simular-mensal', b),
  declaracao: (ano: number) => call<Declaracao>('GET', `/v1/ir/declaracao?ano=${ano}`),
  documentos: (ano: number) => call<{ documentos: Documento[] }>('GET', `/v1/ir/documentos?ano=${ano}`),
  criarDocumento: (d: Omit<Documento, 'id' | 'beneficiario'> & { beneficiario?: string }) => call<{ item: Documento }>('POST', '/v1/ir/documentos', d),
  apagarDocumento: (id: string) => call<void>('DELETE', `/v1/ir/documentos/${id}`),
  rendimentos: (ano: number) => call<{ rendimentos: Rendimento[] }>('GET', `/v1/rendimentos?ano=${ano}`),
  criarRendimento: (r: Omit<Rendimento, 'id'>) => call<{ item: Rendimento }>('POST', '/v1/rendimentos', r),
  apagarRendimento: (id: string) => call<void>('DELETE', `/v1/rendimentos/${id}`),

  agenda: () => call<{ itens: ItemAgenda[]; resumo: { atrasados: number; proximos7dias: number } }>('GET', '/v1/agenda'),
  criarCompromisso: (c: { tipo: 'ipva' | 'iptu' | 'outro'; titulo: string; vencimento: string; valorCents?: number; descontoAvistaPct?: number; parcelas?: number }) =>
    call<{ id: string }>('POST', '/v1/agenda', c),
  pagarCompromisso: (id: string, pago: boolean) => call<unknown>('PATCH', `/v1/agenda/${id}`, { pago }),
  apagarCompromisso: (id: string) => call<void>('DELETE', `/v1/agenda/${id}`),
  pagarRecorrente: (i: { tipo: string; competencia: string; vencimento: string; pago: boolean; valorCents?: number }) =>
    call<{ pago: boolean }>('POST', '/v1/agenda/recorrentes', i),
  avistaOuParcelado: (b: { valorCents: number; descontoAvistaPct: number; parcelas: number; rendimentoMensalPct: number }) =>
    call<{ resultado: AvistaOuParcelado }>('POST', '/v1/agenda/avista-ou-parcelado', b),
  creditos: () => call<{ creditos: Credito[] }>('GET', '/v1/creditos'),
  criarCredito: (c: { origem: Credito['origem']; valorCents: number; descricao?: string; previstoPara?: string | null }) =>
    call<{ item: Credito }>('POST', '/v1/creditos', c),
  marcarCredito: (id: string, status: Credito['status']) => call<{ item: Credito }>('PATCH', `/v1/creditos/${id}`, { status }),
  pendencias: () => call<{ ambiente: string; pendencias: Pendencia[]; ondeConferir: { nome: string; url: string }[] }>('GET', '/v1/pendencias'),

  meiPainel: (ano: number) =>
    call<{ ativo: boolean; faturamento: { totalCents: number }; limite: StatusLimiteMei; das: { totalCents: number } }>('GET', `/v1/mei/painel?ano=${ano}`),
  meiNotas: (ano: number) => call<{ notas: NotaMei[] }>('GET', `/v1/mei/notas?ano=${ano}`),
  emitirNota: (n: { tomadorNome: string; tomadorDoc?: string; descricao: string; valorCents: number }) => call<{ nota: NotaMei }>('POST', '/v1/mei/notas', n),
  cancelarNota: (id: string) => call<{ nota: NotaMei }>('POST', `/v1/mei/notas/${id}/cancelar`),
  comparar: (faturamentoAnualCents: number, atividade: string) =>
    call<{ opcoes: OpcaoRegime[]; observacao: string }>('GET', `/v1/mei/comparar?faturamentoAnualCents=${faturamentoAnualCents}&atividade=${atividade}`),

  perguntar: (pergunta: string) => call<RespostaAssistente>('POST', '/v1/assistente', { pergunta }),
  contadores: (uf?: string) => call<{ contadores: Contador[] }>('GET', `/v1/contadores${uf ? `?uf=${uf}` : ''}`),
  contatar: (id: string, assunto: string, mensagem: string) => call<unknown>('POST', `/v1/contadores/${id}/contato`, { assunto, mensagem }),
};
