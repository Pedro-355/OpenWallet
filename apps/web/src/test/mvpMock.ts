import { vi } from 'vitest';
import type { PerfilFiscal } from '../mvpApi';

/** Dublê do cliente do MVP: cada teste ajusta só as funções de que precisa. */
export function criarMvpFalso() {
  return {
    perfil: vi.fn(),
    salvarPerfil: vi.fn(),
    lerNota: vi.fn(),
    notas: vi.fn(),
    cashback: vi.fn(),
    impostometroAnual: vi.fn(),
    simularMensal: vi.fn(),
    declaracao: vi.fn(),
    documentos: vi.fn(),
    criarDocumento: vi.fn(),
    apagarDocumento: vi.fn(),
    rendimentos: vi.fn(),
    criarRendimento: vi.fn(),
    apagarRendimento: vi.fn(),
    agenda: vi.fn(),
    criarCompromisso: vi.fn(),
    pagarCompromisso: vi.fn(),
    apagarCompromisso: vi.fn(),
    pagarRecorrente: vi.fn(),
    avistaOuParcelado: vi.fn(),
    creditos: vi.fn(),
    criarCredito: vi.fn(),
    marcarCredito: vi.fn(),
    pendencias: vi.fn(),
    meiPainel: vi.fn(),
    meiNotas: vi.fn(),
    emitirNota: vi.fn(),
    cancelarNota: vi.fn(),
    comparar: vi.fn(),
    perguntar: vi.fn(),
    contadores: vi.fn(),
    contatar: vi.fn(),
  };
}

export const umPerfil = (o: Partial<PerfilFiscal> = {}): PerfilFiscal => ({
  tipoRenda: 'clt',
  rendaMensalCents: 500_000,
  dependentes: 0,
  cadunico: false,
  pessoasFamilia: 1,
  rendaFamiliarCents: 0,
  mei: false,
  meiAtividade: null,
  meiAbertura: null,
  carneLeao: false,
  declaraIr: true,
  preenchido: true,
  ...o,
});
