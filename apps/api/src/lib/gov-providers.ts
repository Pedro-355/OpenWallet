/**
 * Integrações com o governo, atrás de interfaces. O MVP vem com versões "sandbox"
 * determinísticas (mesma entrada → mesma saída) para desenvolver e demonstrar sem credenciais.
 *
 *  NotaFiscalProvider  consulta a NFC-e na SEFAZ (itens, valor, CPF na nota)
 *                      Produção: não há API pública única; usar um agregador (ex.: serviços de
 *                      consulta de NF-e/NFC-e) ou o portal de cada SEFAZ.
 *  NfseProvider        emite NFS-e do MEI
 *                      Produção: API do Emissor Nacional da NFS-e (ADN), com certificado digital.
 *  PendenciasProvider  dívida ativa e pendências fiscais
 *                      Produção: PGFN (Regularize) e e-CAC exigem login gov.br do próprio cidadão;
 *                      integração via procuração eletrônica ou agregador autorizado.
 */
import { createHash } from 'node:crypto';
import { categoryFromMcc, type LeituraQr } from '@openwallet/tax';

const hashNum = (s: string, mod: number) => createHash('sha256').update(s).digest().readUInt32BE(0) % mod;

export interface ItemNota {
  descricao: string;
  valorCents: number;
  categoria: string;
}

export interface NotaConsultada {
  emitenteNome: string;
  valorCents: number;
  cpfNaNota: boolean;
  /** AAAA-MM-DD */
  emitidaEm: string;
  itens: ItemNota[];
}

export interface NotaFiscalProvider {
  readonly nome: string;
  consultar(leitura: LeituraQr): Promise<NotaConsultada>;
}

const LOJAS: { nome: string; mcc: number; itens: string[] }[] = [
  { nome: 'SUPERMERCADO EXEMPLO LTDA', mcc: 5411, itens: ['ARROZ 5KG', 'FEIJAO 1KG', 'CAFE 500G', 'DETERGENTE', 'LEITE 1L'] },
  { nome: 'FARMACIA EXEMPLO S/A', mcc: 5912, itens: ['DIPIRONA 500MG', 'PROTETOR SOLAR', 'VITAMINA C'] },
  { nome: 'POSTO EXEMPLO COMBUSTIVEIS', mcc: 5541, itens: ['GASOLINA COMUM'] },
  { nome: 'LANCHONETE EXEMPLO ME', mcc: 5814, itens: ['X-SALADA', 'SUCO NATURAL', 'PAO DE QUEIJO'] },
  { nome: 'LOJA DE ROUPAS EXEMPLO', mcc: 5651, itens: ['CAMISETA', 'CALCA JEANS'] },
];

/** Divide um total em n partes inteiras que somam exatamente o total. */
export function dividirValor(total: number, pesos: number[]): number[] {
  const soma = pesos.reduce((s, p) => s + p, 0);
  const partes = pesos.map((p) => Math.floor((total * p) / soma));
  partes[0]! += total - partes.reduce((s, p) => s + p, 0);
  return partes;
}

export function sandboxNotaFiscal(): NotaFiscalProvider {
  return {
    nome: 'sandbox',
    async consultar(l) {
      const loja = LOJAS[hashNum(l.cnpjEmitente, LOJAS.length)]!;
      const valor = l.valorCents ?? 2_000 + hashNum(l.chave, 28_000);
      const n = 1 + hashNum(l.chave + 'n', loja.itens.length);
      const pesos = Array.from({ length: n }, (_, i) => 1 + hashNum(`${l.chave}${i}`, 9));
      const categoria = categoryFromMcc(loja.mcc);
      const dia = String(l.dia ?? 1 + hashNum(l.chave + 'd', 28)).padStart(2, '0');
      return {
        emitenteNome: loja.nome,
        valorCents: valor,
        cpfNaNota: l.cpfNaNota ?? hashNum(l.chave + 'cpf', 2) === 0,
        emitidaEm: `${l.anoMes}-${dia}`,
        itens: dividirValor(valor, pesos).map((v, i) => ({ descricao: loja.itens[i]!, valorCents: v, categoria })),
      };
    },
  };
}

export interface NfseEmitida {
  numero: number;
  chave: string;
  provider: string;
}

export interface NfseProvider {
  readonly nome: string;
  emitir(input: { userId: string; numero: number; valorCents: number; tomadorDoc: string | null; descricao: string; emitidaEm: string }): Promise<NfseEmitida>;
  cancelar(chave: string): Promise<void>;
}

export function sandboxNfse(): NfseProvider {
  return {
    nome: 'sandbox',
    async emitir(i) {
      const chave = createHash('sha256').update(`${i.userId}|${i.numero}|${i.valorCents}|${i.emitidaEm}`).digest('hex').slice(0, 50).toUpperCase();
      return { numero: i.numero, chave: `NFSE-SANDBOX-${chave}`, provider: 'sandbox' };
    },
    async cancelar() {
      /* o sandbox aceita qualquer cancelamento */
    },
  };
}

export interface Pendencia {
  orgao: 'Receita Federal' | 'PGFN (dívida ativa da União)' | 'Estado' | 'Município';
  descricao: string;
  valorCents: number;
  situacao: 'em_aberto' | 'parcelada';
  comoResolver: string;
}

export interface PendenciasProvider {
  readonly nome: string;
  consultar(userId: string): Promise<Pendencia[]>;
}

/** Sandbox: cerca de 1 em cada 4 usuários tem uma pendência de exemplo. */
export function sandboxPendencias(): PendenciasProvider {
  return {
    nome: 'sandbox',
    async consultar(userId) {
      if (hashNum(userId, 4) !== 0) return [];
      return [
        {
          orgao: 'Estado',
          descricao: 'IPVA em atraso (exemplo do ambiente de teste)',
          valorCents: 45_000 + hashNum(userId + 'v', 100_000),
          situacao: 'em_aberto',
          comoResolver: 'Pague pelo site da Secretaria da Fazenda do seu estado ou parcele. Multa e juros aumentam a cada mês.',
        },
      ];
    },
  };
}
