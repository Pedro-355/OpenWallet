import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { criarMvpFalso, umPerfil } from '../test/mvpMock';
import { Avisos, avisos } from '../ux/avisos';
import { _limparSegmentos } from '../ux/campos';

const falso = criarMvpFalso();
vi.mock('../mvpApi', () => ({ mvp: falso }));

const { Notas } = await import('./Notas');
const { Ir } = await import('./Ir');
const { Agenda, gerarIcs } = await import('./Agenda');
const { Mei } = await import('./Mei');
const { Ajuda } = await import('./Ajuda');
const { AnualCard } = await import('./AnualCard');
const { Navegacao } = await import('./Navegacao');

beforeEach(() => {
  Object.values(falso).forEach((f) => f.mockReset());
  avisos._limpar();
  _limparSegmentos();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T15:00:00Z'));
});

/** A tela com a área de avisos rápidos, como no app. */
const comAvisos = (ui: React.ReactElement) => render(
  <>
    {ui}
    <Avisos />
  </>,
);

/** Liga relógio falso de setTimeout (para o "Desfazer") sem travar o userEvent. */
function relogioRapido() {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-03T15:00:00Z'));
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

const cashbackPadrao = {
  perfilPreenchido: true,
  gastosConsiderados: 2,
  elegibilidade: { elegivel: true, motivos: [], rendaPerCapitaCents: 50_000, limitePerCapitaCents: 81_050 },
  estimativa: { vigente: false, potencialCents: 3_742, totalComCpfCents: 2_863, perdidoSemCpfCents: 879, porCategoria: [], aliquotasEstimadas: { cbsPct: 8.8, ibsPct: 17.7 } },
};

describe('Navegação', () => {
  it('marca a aba atual e troca de aba', async () => {
    const onTrocar = vi.fn();
    render(<Navegacao atual="ir" onTrocar={onTrocar} />);

    expect(screen.getByRole('button', { name: /IR/ })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('button', { name: /Agenda/ }));
    expect(onTrocar).toHaveBeenCalledWith('agenda');
  });
});

describe('Notas e cashback', () => {
  beforeEach(() => {
    falso.notas.mockResolvedValue({ notas: [{ chave: 'k', uf: 'SP', emitenteNome: 'MERCADO X', emitidaEm: '2026-10-03', valorCents: 18_790, cpfNaNota: false }], resumo: { total: 1, semCpf: 1 } });
    falso.cashback.mockResolvedValue(cashbackPadrao);
  });

  it('mostra o cashback estimado e o que se perde sem CPF', async () => {
    render(<Notas />);

    expect(await screen.findByText('Sua família tem direito')).toBeInTheDocument();
    expect(screen.getByText('R$ 37,42')).toBeInTheDocument();
    expect(screen.getByText('−R$ 8,79')).toBeInTheDocument();
    expect(screen.getByText(/ficariam para trás/)).toBeInTheDocument();
    expect(screen.getByText('MERCADO X')).toBeInTheDocument();
    expect(screen.getByText('Sem CPF')).toBeInTheDocument();
  });

  it('registra a nota digitada com o valor informado', async () => {
    falso.lerNota.mockResolvedValue({ nota: { emitenteNome: 'FARMACIA', valorCents: 10_000 }, gastos: [{ categoria: 'saude', valorCents: 10_000, impostoCents: 2_700 }] });
    const user = userEvent.setup();
    comAvisos(<Notas />);

    await user.click(screen.getByRole('button', { name: 'Ler QR code da nota' }));
    const folha = screen.getByRole('dialog', { name: 'Registrar nota fiscal' });
    await user.type(within(folha).getByLabelText(/chave de acesso/i), '3526 1011');
    await user.type(within(folha).getByLabelText(/valor total/i), '100,00');
    await user.click(within(folha).getByRole('button', { name: 'Registrar nota' }));

    expect(falso.lerNota).toHaveBeenCalledWith('3526 1011', 10_000);
    expect(await screen.findByText(/FARMACIA registrada/)).toHaveTextContent('R$ 27,00');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(falso.notas).toHaveBeenCalledTimes(2);
  });

  it('mostra o erro da API quando a nota é inválida', async () => {
    falso.lerNota.mockRejectedValue(new ApiError(400, 'nota_invalida', 'Dígito verificador não confere'));
    const user = userEvent.setup();
    render(<Notas />);

    await user.click(screen.getByRole('button', { name: 'Ler QR code da nota' }));
    expect(screen.getByRole('button', { name: 'Cole o link ou a chave para registrar' })).toBeDisabled();
    await user.type(screen.getByLabelText(/chave de acesso/i), '123');
    await user.click(screen.getByRole('button', { name: 'Registrar nota' }));

    expect(await screen.findByText(/Dígito verificador/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('quem não tem direito vê os motivos', async () => {
    falso.cashback.mockResolvedValue({ ...cashbackPadrao, perfilPreenchido: false, elegibilidade: { ...cashbackPadrao.elegibilidade, elegivel: false, motivos: ['Precisa do CadÚnico.'] } });
    render(<Notas />);

    expect(await screen.findByText('Sem direito pelo perfil')).toBeInTheDocument();
    expect(screen.getByText(/que tal preencher o perfil/)).toBeInTheDocument();
  });
});

describe('Imposto de Renda', () => {
  const declaracao = {
    ano: 2026, exercicio: 2027,
    entrada: { rendimentosTributaveisCents: 6_680_000, impostoPagoCents: 420_000 },
    resultado: {
      melhor: 'completa', vantagemCents: 598, obrigadoADeclarar: true, obrigatoriedadeConfirmada: false, limitesAplicados: [],
      completa: { saldoCents: 233_318 }, simplificada: { saldoCents: 232_720 },
    },
    alertas: [{ nivel: 'alto', codigo: 'saude_sem_documento', mensagem: 'Despesa médica sem CPF/CNPJ', itens: ['d1'] }],
    contagem: { rendimentos: 1, recibos: 1 },
  };
  beforeEach(() => {
    falso.declaracao.mockResolvedValue(declaracao);
    falso.documentos.mockResolvedValue({ documentos: [{ id: 'd1', tipo: 'saude', valorCents: 45_000, pagoEm: '2026-05-10', prestadorNome: 'Dra. Ana', prestadorDoc: null, beneficiario: 'Titular' }] });
    falso.rendimentos.mockResolvedValue({ rendimentos: [{ id: 'r1', tipo: 'salario', valorCents: 6_500_000, recebidoEm: '2026-10-31', pagadorNome: 'Empresa', pagadorDoc: '1', irRetidoCents: 0, inssCents: 0 }] });
  });

  it('mostra restituição, melhor modelo e riscos de malha', async () => {
    render(<Ir />);

    expect(await screen.findByText('Você deve receber de volta')).toBeInTheDocument();
    expect(screen.getByText('+R$ 2.333,18')).toBeInTheDocument();
    expect(screen.getByText(/declaração completa sai melhor/)).toBeInTheDocument();
    expect(screen.getByText('Despesa médica sem CPF/CNPJ')).toBeInTheDocument();
    expect(screen.getByText('Risco alto')).toBeInTheDocument();
    expect(screen.getByText(/ainda não publicou/)).toBeInTheDocument();
  });

  it('imposto a pagar aparece como tal', async () => {
    falso.declaracao.mockResolvedValue({ ...declaracao, resultado: { ...declaracao.resultado, completa: { saldoCents: -10_000 } } });
    render(<Ir />);

    expect(await screen.findByText('Você deve pagar')).toBeInTheDocument();
    expect(screen.getByText('−R$ 100,00')).toBeInTheDocument();
  });

  it('sem rendimentos pede para lançar', async () => {
    falso.declaracao.mockResolvedValue({ ...declaracao, contagem: { rendimentos: 0, recibos: 0 } });
    render(<Ir />);

    expect(await screen.findByText(/Lance seus rendimentos/)).toBeInTheDocument();
  });

  it('simulador mensal mostra o redutor', async () => {
    falso.simularMensal.mockResolvedValue({ resultado: { inssCents: 64_151, impostoTabelaCents: 56_485, reducaoLei15270Cents: 17_975, impostoCents: 38_510, aliquotaEfetivaPct: 6.42, liquidoCents: 497_339 } });
    const user = userEvent.setup();
    render(<Ir />);

    await user.click(screen.getByRole('tab', { name: 'Simular salário' }));
    expect(screen.getByRole('button', { name: 'Digite o salário para calcular' })).toBeDisabled();
    await user.type(screen.getByLabelText('Salário bruto (R$)'), '6.000');
    await user.click(screen.getByRole('button', { name: 'Calcular imposto do mês' }));

    expect(falso.simularMensal).toHaveBeenCalledWith({ brutoCents: 600_000, dependentes: 0 });
    expect(within(await screen.findByLabelText('Resultado')).getByText('−R$ 385,10')).toBeInTheDocument();
  });

  it('guarda recibo e rendimento e recarrega a prévia', async () => {
    falso.criarDocumento.mockResolvedValue({});
    falso.criarRendimento.mockResolvedValue({});
    const user = userEvent.setup();
    comAvisos(<Ir />);
    await screen.findByText('Você deve receber de volta');

    await user.click(screen.getByRole('tab', { name: 'Recibos' }));
    await user.click(screen.getByRole('button', { name: /Guardar recibo/ }));
    const recibo = screen.getByRole('form', { name: 'Novo recibo' });
    await user.type(within(recibo).getByLabelText(/Valor do recibo/), '200');
    await user.type(within(recibo).getByLabelText(/Quem recebeu/), 'Clínica');
    await user.type(within(recibo).getByLabelText(/CPF ou CNPJ/), '11222333000181');
    expect(within(recibo).getByLabelText(/CPF ou CNPJ/)).toHaveValue('11.222.333/0001-81');
    await user.click(within(recibo).getByRole('button', { name: 'Guardar recibo' }));
    expect(falso.criarDocumento).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'saude', valorCents: 20_000, prestadorNome: 'Clínica', prestadorDoc: '11222333000181' }));
    expect(await screen.findByText('Recibo guardado.')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Rendimentos' }));
    await user.click(screen.getByRole('button', { name: /Adicionar rendimento/ }));
    const rend = screen.getByRole('form', { name: 'Novo rendimento' });
    await user.type(within(rend).getByLabelText(/Valor bruto/), '5000');
    await user.type(within(rend).getByLabelText(/IR retido/), '100');
    await user.click(within(rend).getByRole('button', { name: 'Guardar rendimento' }));
    expect(falso.criarRendimento).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'salario', valorCents: 500_000, irRetidoCents: 10_000, inssCents: 0 }));
    await waitFor(() => expect(falso.declaracao).toHaveBeenCalledTimes(3));
  });

  it('apaga recibo e rendimento', async () => {
    falso.apagarDocumento.mockResolvedValue(undefined);
    falso.apagarRendimento.mockResolvedValue(undefined);
    const user = relogioRapido();
    comAvisos(<Ir />);

    await user.click(screen.getByRole('tab', { name: 'Recibos' }));
    await user.click(await screen.findByRole('button', { name: 'Recibo de Dra. Ana' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Apagar recibo/ }));
    expect(screen.queryByRole('button', { name: 'Recibo de Dra. Ana' })).not.toBeInTheDocument();
    expect(falso.apagarDocumento).not.toHaveBeenCalled(); // ainda dá para desfazer
    await user.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(screen.getByRole('button', { name: 'Recibo de Dra. Ana' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Rendimentos' }));
    await user.click(await screen.findByRole('button', { name: /Salário \(carteira assinada\)/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Apagar rendimento/ }));
    vi.advanceTimersByTime(5_000);

    await waitFor(() => expect(falso.apagarRendimento).toHaveBeenCalledWith('r1'));
    expect(falso.apagarDocumento).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('Agenda', () => {
  const itens = [
    { id: null, origem: 'automatica', tipo: 'das_mei', titulo: 'DAS do MEI', vencimento: '2026-10-20', competencia: '2026-09', valorCents: 8_605, pago: false, previsto: false, dica: 'Pague pelo app', atrasado: true, descontoAvistaPct: null, parcelas: null },
    { id: null, origem: 'automatica', tipo: 'das_mei', titulo: 'DAS do MEI', vencimento: '2026-11-19', competencia: '2026-10', valorCents: 8_605, pago: false, previsto: false, dica: 'Pague pelo app', atrasado: false, descontoAvistaPct: null, parcelas: null },
    { id: 'o1', origem: 'manual', tipo: 'ipva', titulo: 'IPVA, do carro', vencimento: '2027-01-21', competencia: null, valorCents: 285_000, pago: false, previsto: true, dica: '', atrasado: false, descontoAvistaPct: 3, parcelas: 5 },
  ];
  beforeEach(() => {
    falso.agenda.mockResolvedValue({ itens, resumo: { atrasados: 1, proximos7dias: 0 } });
    falso.creditos.mockResolvedValue({ creditos: [{ id: 'c1', origem: 'restituicao_ir', descricao: null, valorCents: 85_000, previstoPara: '2027-06-30', status: 'previsto' }] });
    falso.pendencias.mockResolvedValue({ ambiente: 'teste', pendencias: [{ orgao: 'Estado', descricao: 'IPVA em atraso', valorCents: 50_000, situacao: 'em_aberto', comoResolver: 'Pague no site' }], ondeConferir: [{ nome: 'Regularize', url: 'https://www.regularize.pgfn.gov.br' }] });
  });

  it('lista vencimentos, atrasos, créditos e pendências; a dica aparece uma vez por tipo', async () => {
    const user = userEvent.setup();
    render(<Agenda />);

    expect(await screen.findByText(/1 vencimento passou/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Vencimentos/ })).toHaveTextContent('1');
    expect(screen.getAllByRole('button', { name: /O que é isso\? DAS do MEI/ })).toHaveLength(1);
    expect(screen.getByText('Data prevista')).toBeInTheDocument();
    expect(screen.getByText('Venceu')).toBeInTheDocument();
    expect(await screen.findByText(/IPVA em atraso/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Regularize' })).toHaveAttribute('href', 'https://www.regularize.pgfn.gov.br');

    await user.click(screen.getByRole('tab', { name: 'A receber' }));
    expect(await screen.findAllByText('R$ 850,00')).toHaveLength(2);
  });

  it('marca recorrente e manual como pagos', async () => {
    falso.pagarRecorrente.mockResolvedValue({ pago: true });
    falso.pagarCompromisso.mockResolvedValue({});
    const user = userEvent.setup();
    comAvisos(<Agenda />);

    const das = await screen.findByRole('button', { name: 'Pago: DAS do MEI 19 nov' });
    await user.click(das);
    expect(das).toHaveAttribute('aria-pressed', 'true'); // muda na hora
    expect(await screen.findByText('DAS do MEI marcado como pago.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pago: IPVA, do carro 21 jan 2027' }));

    expect(falso.pagarRecorrente).toHaveBeenCalledWith({ tipo: 'das_mei', competencia: '2026-10', vencimento: '2026-11-19', pago: true, valorCents: 8_605 });
    expect(falso.pagarCompromisso).toHaveBeenCalledWith('o1', true);

    await user.click(screen.getAllByRole('button', { name: 'Desfazer' }).at(-1)!);
    expect(falso.pagarCompromisso).toHaveBeenLastCalledWith('o1', false);
  });

  it('adiciona IPVA, crédito e marca crédito recebido', async () => {
    falso.criarCompromisso.mockResolvedValue({ id: 'n' });
    falso.criarCredito.mockResolvedValue({});
    falso.marcarCredito.mockResolvedValue({});
    const user = userEvent.setup();
    comAvisos(<Agenda />);
    await screen.findByText(/1 vencimento passou/);

    await user.click(screen.getByRole('button', { name: /Adicionar IPVA, IPTU ou outro/ }));
    const form = screen.getByRole('form', { name: 'Novo compromisso' });
    expect(within(form).getByRole('button', { name: 'Escolha o vencimento' })).toBeDisabled();
    await user.type(within(form).getByLabelText('Vencimento'), '2027-03-10');
    await user.type(within(form).getByLabelText('Valor (R$)'), '1.900');
    await user.click(within(form).getByRole('button', { name: 'Adicionar à agenda' }));
    expect(falso.criarCompromisso).toHaveBeenCalledWith({ tipo: 'ipva', titulo: 'IPVA', vencimento: '2027-03-10', valorCents: 190_000 });
    expect(await screen.findByText('Adicionado à agenda.')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'A receber' }));
    await user.click(screen.getByRole('button', { name: /Anotar valor a receber/ }));
    const credito = screen.getByRole('form', { name: 'Novo crédito' });
    await user.type(within(credito).getByLabelText('Valor a receber'), '50');
    await user.click(within(credito).getByRole('button', { name: 'Adicionar' }));
    expect(falso.criarCredito).toHaveBeenCalledWith({ origem: 'restituicao_ir', valorCents: 5_000, previstoPara: null });

    await user.click(await screen.findByRole('button', { name: 'Recebi' }));
    expect(falso.marcarCredito).toHaveBeenCalledWith('c1', 'recebido');
    expect(screen.queryByRole('button', { name: 'Recebi' })).not.toBeInTheDocument();
  });

  it('calculadora à vista ou parcelado', async () => {
    falso.avistaOuParcelado.mockResolvedValue({ resultado: { avistaCents: 270_000, economiaAvistaCents: 30_000, recomendacao: 'avista', explicacao: 'O desconto vale a pena.', jurosImplicitoMensalPct: 5, parceladoTotalCents: 300_000 } });
    const user = userEvent.setup();
    render(<Agenda />);

    await user.click(screen.getByRole('tab', { name: 'À vista ou parcelado?' }));
    const form = screen.getByRole('form', { name: 'À vista ou parcelado' });
    await user.type(within(form).getByLabelText('Valor total (R$)'), '3000');
    await user.click(within(form).getByRole('button', { name: 'Comparar as duas opções' }));

    expect(await screen.findByText('À vista sai melhor')).toBeInTheDocument();
    expect(screen.getByText(/A decisão é sua/)).toBeInTheDocument();
    expect(falso.avistaOuParcelado).toHaveBeenCalledWith({ valorCents: 300_000, descontoAvistaPct: 3, parcelas: 10, rendimentoMensalPct: 1 });
  });

  it('gera .ics só com o que não foi pago, escapando vírgulas, e com lembrete 2 dias antes', () => {
    const ics = gerarIcs([...itens, { ...itens[1]!, competencia: '2026-11', pago: true }] as never);

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics).toContain('DTSTART;VALUE=DATE:20270121');
    expect(ics).toContain('SUMMARY:IPVA\\, do carro');
    expect(ics).toContain('TRIGGER:-P2D');
  });

  it('baixa o arquivo da agenda', async () => {
    const criar = vi.fn(() => 'blob:x');
    const revogar = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: criar, revokeObjectURL: revogar }));
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<Agenda />);

    await user.click(await screen.findByRole('button', { name: 'Levar para a agenda do celular' }));

    expect(criar).toHaveBeenCalled();
    expect(clique).toHaveBeenCalled();
    expect(revogar).toHaveBeenCalledWith('blob:x');
  });
});

describe('MEI', () => {
  const painel = {
    ativo: true,
    faturamento: { totalCents: 5_800_000 },
    limite: { usadoPct: 71.6, limiteCents: 8_100_000, mediaMensalDisponivelCents: 1_150_000, nivel: 'atencao', mensagem: 'Você já usou mais de 70% do limite do ano.' },
    das: { totalCents: 8_605 },
  };
  beforeEach(() => {
    falso.meiPainel.mockResolvedValue(painel);
    falso.meiNotas.mockResolvedValue({ notas: [{ id: 'n1', numero: 1, tomadorNome: 'Cliente A', descricao: 'Site', valorCents: 3_200_000, emitidaEm: '2026-04-10', status: 'emitida', ambiente: 'teste' }] });
  });

  it('mostra uso do limite e alerta', async () => {
    render(<Mei />);

    expect(await screen.findByRole('progressbar', { name: 'Uso do limite do MEI' })).toHaveAttribute('aria-valuenow', '71.6');
    expect(screen.getByText(/mais de 70%/)).toBeInTheDocument();
  });

  it('emite nota e cancela outra', async () => {
    falso.emitirNota.mockResolvedValue({ nota: { numero: 2, ambiente: 'teste' } });
    falso.cancelarNota.mockResolvedValue({});
    const user = userEvent.setup();
    comAvisos(<Mei />);
    await screen.findByRole('progressbar');

    await user.click(screen.getByRole('button', { name: /Emitir nota/ }));
    const form = screen.getByRole('form', { name: 'Emitir nota' });
    expect(within(form).getByRole('button', { name: 'Digite o nome do cliente' })).toBeDisabled();
    await user.type(within(form).getByLabelText('Cliente'), 'Cliente B');
    await user.type(within(form).getByLabelText('Serviço prestado'), 'Manutenção');
    await user.type(within(form).getByLabelText('Valor (R$)'), '2.600');
    await user.click(within(form).getByRole('button', { name: 'Emitir nota' }));
    expect(falso.emitirNota).toHaveBeenCalledWith({ tomadorNome: 'Cliente B', tomadorDoc: undefined, descricao: 'Manutenção', valorCents: 260_000 });
    expect(await screen.findByText(/Nota nº 2 emitida \(ambiente de teste\)/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Notas' }));
    await user.click(await screen.findByRole('button', { name: 'Nota nº 1, Cliente A' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar nota' }));
    expect(screen.getByText(/Cancelar não tem volta/)).toBeInTheDocument();
    expect(falso.cancelarNota).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Sim, cancelar nº 1' }));
    expect(falso.cancelarNota).toHaveBeenCalledWith('n1');
    expect(await screen.findByText('Nota nº 1 cancelada.')).toBeInTheDocument();
  });

  it('quem não é MEI vê o atalho para o perfil e o comparador lê "90.000" como noventa mil', async () => {
    falso.meiPainel.mockResolvedValue({ ...painel, ativo: false });
    falso.comparar.mockResolvedValue({
      observacao: '',
      opcoes: [
        { regime: 'simples_anexo_iii', nome: 'Simples III', permitido: true, impostoAnualCents: 900_000, inssAnualCents: 0, cargaPct: 10, detalhes: 'DAS 6%' },
        { regime: 'mei', nome: 'MEI', permitido: false, motivo: 'Acima de 81 mil', impostoAnualCents: 0, inssAnualCents: 0, cargaPct: 0, detalhes: '' },
      ],
    });
    const irParaPerfil = vi.fn();
    const user = userEvent.setup();
    render(<Mei irParaPerfil={irParaPerfil} />);

    await user.click(await screen.findByRole('button', { name: 'Abrir perfil' }));
    expect(irParaPerfil).toHaveBeenCalled();

    await user.type(screen.getByLabelText('Faturamento por ano (R$)'), '90.000');
    await user.click(screen.getByRole('button', { name: 'Comparar regimes' }));
    expect(falso.comparar).toHaveBeenCalledWith(9_000_000, 'servicos');
    expect(await screen.findByText('Mais barato')).toBeInTheDocument();
    expect(screen.getByText('Acima de 81 mil')).toBeInTheDocument();
  });
});

describe('Ajuda', () => {
  beforeEach(() => {
    falso.perfil.mockResolvedValue({ perfil: umPerfil({ preenchido: false }) });
    falso.contadores.mockResolvedValue({ contadores: [{ id: 'a1', nome: 'Escritório Exemplo', crc: 'x', uf: 'SP', cidade: 'São Paulo', especialidades: ['malha_fina'], precoConsultaCents: 15_000, atendeOnline: true, exemplo: true }] });
  });

  it('assistente responde com fontes a partir de uma sugestão', async () => {
    falso.perguntar.mockResolvedValue({ resposta: 'O limite é R$ 81 mil.', fontes: [{ id: 'guia-mei', fonte: 'LC 123/2006', titulo: 'MEI' }], modo: 'busca', aviso: '' });
    const user = userEvent.setup();
    render(<Ajuda />);

    await user.click(screen.getByRole('button', { name: 'Quanto o MEI pode faturar?' }));

    expect(await screen.findByText('O limite é R$ 81 mil.')).toBeInTheDocument();
    expect(screen.getByText('Fontes: LC 123/2006')).toBeInTheDocument();
  });

  it('pergunta digitada curta demais não é enviada', async () => {
    const user = userEvent.setup();
    render(<Ajuda />);

    await user.type(screen.getByLabelText('Sua pergunta'), 'oi');
    await user.click(screen.getByRole('button', { name: 'Perguntar' }));

    expect(falso.perguntar).not.toHaveBeenCalled();
  });

  it('salva o perfil com valores em centavos e mostra campos do MEI', async () => {
    falso.salvarPerfil.mockImplementation(async (p) => ({ perfil: umPerfil(p) }));
    const user = userEvent.setup();
    comAvisos(<Ajuda />);

    await user.click(screen.getByRole('tab', { name: /Seu perfil/ }));
    expect(await screen.findByText(/Com o perfil preenchido/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar perfil' })).not.toBeInTheDocument(); // só aparece depois de mudar algo
    await user.clear(screen.getByLabelText('Renda bruta por mês (R$)'));
    await user.type(screen.getByLabelText('Renda bruta por mês (R$)'), '6.500');
    await user.click(screen.getByRole('switch', { name: 'Sou MEI' }));
    await user.selectOptions(screen.getByLabelText('Atividade do MEI'), 'comercio');
    await user.click(screen.getByRole('switch', { name: /CadÚnico/ }));
    await user.click(screen.getByRole('button', { name: 'Salvar perfil' }));

    expect(falso.salvarPerfil).toHaveBeenCalledWith(expect.objectContaining({ rendaMensalCents: 650_000, mei: true, meiAtividade: 'comercio', cadunico: true }));
    expect(falso.salvarPerfil.mock.calls[0]![0]).not.toHaveProperty('preenchido');
    expect(await screen.findByText('Perfil salvo.')).toBeInTheDocument();
  });

  it('pede contato a um contador (cadastro de exemplo sinalizado)', async () => {
    falso.contatar.mockResolvedValue({});
    const user = userEvent.setup();
    comAvisos(<Ajuda />);

    await user.click(screen.getByRole('tab', { name: 'Contadores' }));
    expect(await screen.findByText('Exemplo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Contatar' }));
    expect(screen.getByRole('dialog', { name: /Falar com Escritório Exemplo/ })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Sua mensagem'), 'Caí na malha fina, preciso de ajuda.');
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));

    expect(falso.contatar).toHaveBeenCalledWith('a1', 'outro', 'Caí na malha fina, preciso de ajuda.');
    expect(await screen.findByText(/Pedido enviado/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Impostômetro anual', () => {
  it('traduz o total em dias de trabalho', async () => {
    falso.impostometroAnual.mockResolvedValue({ ano: 2026, totalCents: 1_169_358, partes: [{ chave: 'ir', rotulo: 'Imposto de Renda', cents: 420_000 }], pctDaRenda: 17.5, diasTrabalhados: 64, liberdadeEm: '2026-03-06', estimado: true });
    render(<AnualCard />);

    expect(await screen.findByText('64 dias')).toBeInTheDocument();
    expect(screen.getByText(/Até 6 de março/)).toBeInTheDocument();
    expect(screen.getByText(/estimados pela renda/)).toBeInTheDocument();
  });

  it('sem impostos no ano não mostra nada', async () => {
    falso.impostometroAnual.mockResolvedValue({ ano: 2026, totalCents: 0, partes: [], pctDaRenda: null, diasTrabalhados: null, liberdadeEm: null, estimado: false });
    const { container } = render(<AnualCard />);

    await waitFor(() => expect(falso.impostometroAnual).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('erro de rede aparece com opção de tentar de novo', async () => {
    falso.notas.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ notas: [], resumo: { total: 0, semCpf: 0 } });
    falso.cashback.mockResolvedValue(cashbackPadrao);
    const user = userEvent.setup();
    render(<Notas />);

    await user.click(await screen.findByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText(/Nenhuma nota ainda/)).toBeInTheDocument();
  });
});
