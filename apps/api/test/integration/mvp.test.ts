import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser, setup } from '../helpers.js';

// Chaves válidas de teste (CNPJ de exemplo 11.222.333/0001-81).
const NFCE_SP = '35261011222333000181650010000123451123456787';
const NFCE_OFFLINE = '35261011222333000181650010000123469876543213';

let ctx: Awaited<ReturnType<typeof setup>>;
const chamadasModelo: unknown[] = [];
beforeAll(async () => {
  const fetchFn = (async (_url: string, init: RequestInit) => {
    chamadasModelo.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Resposta do modelo [ctn-168].' }] }), { status: 200 });
  }) as unknown as typeof fetch;
  ctx = await setup({ env: { ASSISTENTE_API_KEY: 'chave-de-teste' }, fetchFn });
});
afterAll(async () => {
  await ctx.close();
});

const inj = (auth: Record<string, string>) => ({
  get: (url: string) => ctx.app.inject({ method: 'GET', url, headers: auth }),
  post: (url: string, payload?: object) => ctx.app.inject({ method: 'POST', url, headers: auth, payload }),
  put: (url: string, payload: object) => ctx.app.inject({ method: 'PUT', url, headers: auth, payload }),
  patch: (url: string, payload: object) => ctx.app.inject({ method: 'PATCH', url, headers: auth, payload }),
  del: (url: string) => ctx.app.inject({ method: 'DELETE', url, headers: auth }),
});

describe('perfil fiscal', () => {
  it('começa com valores padrão e aceita atualização parcial', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    expect((await u.get('/v1/perfil-fiscal')).json().perfil).toMatchObject({ preenchido: false, tipoRenda: 'clt' });

    const res = await u.put('/v1/perfil-fiscal', { mei: true, dependentes: 2 });

    expect(res.statusCode).toBe(200);
    expect(res.json().perfil).toMatchObject({ preenchido: true, mei: true, meiAtividade: 'servicos', dependentes: 2 });
    expect((await u.put('/v1/perfil-fiscal', { cadunico: true })).json().perfil).toMatchObject({ mei: true, cadunico: true });
  });

  it('recusa dados inválidos', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    expect((await u.put('/v1/perfil-fiscal', { dependentes: -1 })).statusCode).toBe(400);
  });
});

describe('leitura de nota fiscal (NFC-e)', () => {
  it('lê o QR code, cria gastos com imposto e não duplica', async () => {
    const u = inj((await registerUser(ctx.app, 'RJ')).auth);
    const qr = `https://www.nfce.fazenda.sp.gov.br/qrcode?p=${NFCE_SP}|2|1|1|ABC`;

    const res = await u.post('/v1/notas/ler', { texto: qr, valorCents: 12_345 });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.nota).toMatchObject({ chave: NFCE_SP, uf: 'SP', valorCents: 12_345 });
    expect(body.gastos.reduce((s: number, g: { valorCents: number }) => s + g.valorCents, 0)).toBe(12_345);
    // O gasto usa a UF da nota (SP), não a do perfil (RJ).
    const lista = (await u.get('/v1/expenses?limit=50')).json().items;
    expect(lista[0]).toMatchObject({ source: 'nfce', uf: 'SP' });

    const de_novo = await u.post('/v1/notas/ler', { texto: qr });
    expect(de_novo.statusCode).toBe(409);
    expect(de_novo.json().error).toBe('nota_ja_lida');
  });

  it('usa o valor do QR code offline e permite forçar a categoria', async () => {
    const u = inj((await registerUser(ctx.app)).auth);

    const res = await u.post('/v1/notas/ler', { texto: `https://x.sp.gov.br/q?p=${NFCE_OFFLINE}|2|1|07|152.37|aa|1|BB`, categoria: 'mercado' });

    expect(res.json().nota.valorCents).toBe(15_237);
    expect(res.json().gastos).toEqual([expect.objectContaining({ categoria: 'mercado', valorCents: 15_237 })]);
    expect((await u.get('/v1/notas')).json().resumo.total).toBe(1);
  });

  it('chave inválida responde 400 com explicação', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    const res = await u.post('/v1/notas/ler', { texto: NFCE_SP.slice(0, 43) + '0' });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Dígito/);
  });
});

describe('imposto de renda', () => {
  it('simula o mês com o redutor de 2026', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    const res = await u.post('/v1/ir/simular-mensal', { brutoCents: 600_000 });

    expect(res.json().resultado.impostoCents).toBe(38_510);
  });

  it('simula o ano', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    expect((await u.post('/v1/ir/simular-anual', { rendimentosTributaveisCents: 6_000_000 })).json().resultado.simplificada.impostoDevidoCents).toBe(0);
  });

  it('monta a prévia da declaração com rendimentos, recibos e carnê-leão, e aponta riscos de malha', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    await u.put('/v1/perfil-fiscal', { dependentes: 1 });
    expect((await u.post('/v1/rendimentos', { tipo: 'salario', valorCents: 9_000_000, recebidoEm: '2026-06-30', pagadorDoc: '11.222.333/0001-81', irRetidoCents: 500_000, inssCents: 900_000 })).statusCode).toBe(201);
    await u.post('/v1/rendimentos', { tipo: 'aluguel', valorCents: 1_200_000, recebidoEm: '2026-03-10' });
    await u.post('/v1/ir/documentos', { tipo: 'saude', valorCents: 300_000, pagoEm: '2026-04-01', prestadorNome: 'Dentista sem recibo' });
    await u.post('/v1/ir/documentos', { tipo: 'educacao', valorCents: 500_000, pagoEm: '2026-02-01', prestadorNome: 'Escola', prestadorDoc: '11222333000181', beneficiario: 'Filho' });
    await u.post('/v1/agenda/recorrentes', { tipo: 'carne_leao', competencia: '2026-03', vencimento: '2026-04-30', pago: true, valorCents: 10_000 });

    const res = await u.get('/v1/ir/declaracao?ano=2026');

    expect(res.statusCode).toBe(200);
    const d = res.json();
    expect(d.entrada).toMatchObject({
      rendimentosTributaveisCents: 10_200_000,
      impostoPagoCents: 510_000,
      saudeCents: 300_000,
      educacaoPorPessoaCents: [500_000],
      dependentes: 1,
    });
    expect(d.resultado.melhor).toMatch(/completa|simplificada/);
    expect(d.alertas.map((a: { codigo: string }) => a.codigo)).toContain('saude_sem_documento');
    expect(d.alertas.map((a: { codigo: string }) => a.codigo)).not.toContain('carne_leao_pendente');
  });

  it('CRUD da pasta de recibos: altera, filtra por ano e apaga', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    const criado = (await u.post('/v1/ir/documentos', { tipo: 'saude', valorCents: 100, pagoEm: '2025-12-01', prestadorNome: 'X' })).json().item;

    expect((await u.patch(`/v1/ir/documentos/${criado.id}`, { valorCents: 200 })).json().item.valorCents).toBe(200);
    expect((await u.patch(`/v1/ir/documentos/${criado.id}`, {})).statusCode).toBe(400);
    expect((await u.get('/v1/ir/documentos?ano=2026')).json().documentos).toEqual([]);
    expect((await u.get('/v1/ir/documentos?ano=2025')).json().documentos).toHaveLength(1);
    expect((await u.del(`/v1/ir/documentos/${criado.id}`)).statusCode).toBe(204);
    expect((await u.del(`/v1/ir/documentos/${criado.id}`)).statusCode).toBe(404);
    expect((await u.patch(`/v1/ir/documentos/${criado.id}`, { valorCents: 1 })).statusCode).toBe(404);
  });

  it('documento com tamanho errado é recusado', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    expect((await u.post('/v1/ir/documentos', { tipo: 'saude', valorCents: 100, pagoEm: '2026-01-01', prestadorNome: 'X', prestadorDoc: '123' })).statusCode).toBe(400);
  });
});

describe('agenda', () => {
  it('mostra DAS e carnê-leão do perfil, marca como pago e inclui IPVA manual', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    await u.put('/v1/perfil-fiscal', { mei: true, meiAtividade: 'servicos', carneLeao: true });
    const ipva = await u.post('/v1/agenda', { tipo: 'ipva', titulo: 'IPVA do carro', vencimento: '2027-01-20', valorCents: 300_000, descontoAvistaPct: 3, parcelas: 10 });
    expect(ipva.statusCode).toBe(201);

    const ag = (await u.get('/v1/agenda?de=2026-11-01&ate=2027-01-31')).json();

    const das = ag.itens.find((i: { tipo: string; competencia: string }) => i.tipo === 'das_mei' && i.competencia === '2026-10');
    expect(das).toMatchObject({ vencimento: '2026-11-19', valorCents: 8_605, pago: false, origem: 'automatica' });
    expect(ag.itens.find((i: { tipo: string }) => i.tipo === 'ipva')).toMatchObject({ titulo: 'IPVA do carro', parcelas: 10 });

    await u.post('/v1/agenda/recorrentes', { tipo: 'das_mei', competencia: '2026-10', vencimento: '2026-11-19', pago: true });
    const depois = (await u.get('/v1/agenda?de=2026-11-01&ate=2026-11-30')).json();
    expect(depois.itens.find((i: { tipo: string }) => i.tipo === 'das_mei')).toMatchObject({ pago: true, valorCents: 8_605 });

    await u.post('/v1/agenda/recorrentes', { tipo: 'das_mei', competencia: '2026-10', vencimento: '2026-11-19', pago: false });
    expect((await u.get('/v1/agenda?de=2026-11-01&ate=2026-11-30')).json().itens.find((i: { tipo: string }) => i.tipo === 'das_mei').pago).toBe(false);
  });

  it('paga, desfaz e apaga compromisso manual', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    const { id } = (await u.post('/v1/agenda', { tipo: 'iptu', titulo: 'IPTU', vencimento: '2027-02-10' })).json();

    expect((await u.patch(`/v1/agenda/${id}`, { pago: true, valorCents: 120_000 })).json().pagoEm).not.toBeNull();
    expect((await u.patch(`/v1/agenda/${id}`, { pago: false })).json().pagoEm).toBeNull();
    expect((await u.del(`/v1/agenda/${id}`)).statusCode).toBe(204);
    expect((await u.patch(`/v1/agenda/${id}`, { pago: true })).statusCode).toBe(404);
    expect((await u.del(`/v1/agenda/${id}`)).statusCode).toBe(404);
  });

  it('período invertido é recusado', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    expect((await u.get('/v1/agenda?de=2027-01-01&ate=2026-01-01')).statusCode).toBe(400);
  });

  it('calcula à vista ou parcelado', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    const res = await u.post('/v1/agenda/avista-ou-parcelado', { valorCents: 300_000, descontoAvistaPct: 10, parcelas: 3 });

    expect(res.json().resultado.recomendacao).toBe('avista');
  });
});

describe('MEI', () => {
  it('emite notas em sequência, soma no faturamento e cancela', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    expect((await u.post('/v1/mei/notas', { tomadorNome: 'Cliente', descricao: 'Serviço', valorCents: 100 })).statusCode).toBe(409);
    await u.put('/v1/perfil-fiscal', { mei: true, meiAtividade: 'servicos', meiAbertura: '2020-01-01' });

    const [a, b] = await Promise.all([
      u.post('/v1/mei/notas', { tomadorNome: 'Cliente A', descricao: 'Site', valorCents: 5_000_000, emitidaEm: '2026-03-10' }),
      u.post('/v1/mei/notas', { tomadorNome: 'Cliente B', tomadorDoc: '529.982.247-25', descricao: 'Manutenção', valorCents: 2_000_000, emitidaEm: '2026-04-10' }),
    ]);
    expect([a.json().nota.numero, b.json().nota.numero].sort()).toEqual([1, 2]);
    expect(a.json().nota).toMatchObject({ status: 'emitida', ambiente: 'teste' });
    await u.post('/v1/rendimentos', { tipo: 'mei', valorCents: 500_000, recebidoEm: '2026-05-01' });

    const painel = (await u.get('/v1/mei/painel?ano=2026')).json();
    expect(painel.faturamento.totalCents).toBe(7_500_000);
    expect(painel.limite.nivel).toBe('alerta');
    expect(painel.das.totalCents).toBe(8_605);

    const cancelada = await u.post(`/v1/mei/notas/${a.json().nota.id}/cancelar`);
    expect(cancelada.json().nota.status).toBe('cancelada');
    expect((await u.post(`/v1/mei/notas/${a.json().nota.id}/cancelar`)).json().nota.status).toBe('cancelada');
    expect((await u.get('/v1/mei/painel?ano=2026')).json().faturamento.totalCents).toBe(2_500_000);
    expect((await u.get('/v1/mei/notas?ano=2026')).json().notas).toHaveLength(2);
  });

  it('não emite nota com data futura e não cancela nota de outra pessoa', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    await u.put('/v1/perfil-fiscal', { mei: true });
    expect((await u.post('/v1/mei/notas', { tomadorNome: 'X', descricao: 'Serviço', valorCents: 100, emitidaEm: '2099-01-01' })).statusCode).toBe(400);
    expect((await u.post('/v1/mei/notas/00000000-0000-0000-0000-000000000000/cancelar')).statusCode).toBe(404);
  });

  it('compara regimes', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    const res = await u.get('/v1/mei/comparar?faturamentoAnualCents=7000000&atividade=servicos');

    expect(res.json().opcoes[0].regime).toBe('mei');
  });
});

describe('impostômetro anual e cashback', () => {
  it('estima IR e INSS pela renda do perfil quando não há rendimentos lançados', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    await u.put('/v1/perfil-fiscal', { rendaMensalCents: 600_000 });

    const r = (await u.get('/v1/impostometro/anual?ano=2025')).json();

    expect(r).toMatchObject({ estimado: true, mesesConsiderados: 12 });
    expect(r.partes.map((p: { chave: string }) => p.chave)).toEqual(['ir', 'inss']);
    expect(r.diasTrabalhados).toBeGreaterThan(0);
  });

  it('usa rendimentos, gastos, IPVA pago e DAS quando existem', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    await u.post('/v1/rendimentos', { tipo: 'salario', valorCents: 1_000_000, recebidoEm: '2025-05-05', irRetidoCents: 50_000, inssCents: 80_000 });
    await u.post('/v1/expenses', { amountCents: 10_000, category: 'mercado', spentOn: '2025-05-06' });
    const { id } = (await u.post('/v1/agenda', { tipo: 'ipva', titulo: 'IPVA', vencimento: '2025-01-20', valorCents: 200_000 })).json();
    await u.patch(`/v1/agenda/${id}`, { pago: true });
    await u.post('/v1/agenda/recorrentes', { tipo: 'das_mei', competencia: '2025-04', vencimento: '2025-05-20', pago: true, valorCents: 8_000 });

    const r = (await u.get('/v1/impostometro/anual?ano=2025')).json();

    expect(r.estimado).toBe(false);
    expect(r.partes.find((p: { chave: string }) => p.chave === 'ir').cents).toBe(50_000);
    expect(r.partes.find((p: { chave: string }) => p.chave === 'outros').cents).toBe(8_000);
    // IPVA pago "hoje" entra no ano corrente, não em 2025
    expect(r.partes.find((p: { chave: string }) => p.chave === 'consumo').cents).toBeGreaterThan(0);
  });

  it('cashback: elegibilidade pelo perfil e estimativa pelos gastos com CPF', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    await u.put('/v1/perfil-fiscal', { cadunico: true, pessoasFamilia: 4, rendaFamiliarCents: 280_000 });
    await u.post('/v1/expenses', { amountCents: 20_000, category: 'moradia', spentOn: '2026-10-01' });
    await u.post('/v1/notas/ler', { texto: NFCE_SP, valorCents: 10_000 });

    const r = (await u.get('/v1/cashback?ano=2026')).json();

    expect(r.elegibilidade.elegivel).toBe(true);
    expect(r.gastosConsiderados).toBeGreaterThanOrEqual(2);
    expect(r.estimativa.potencialCents).toBeGreaterThan(0);
    expect(r.estimativa.vigente).toBe(false);
  });
});

describe('créditos, pendências, assistente e contadores', () => {
  it('créditos a receber: cria e marca como recebido', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    const c = (await u.post('/v1/creditos', { origem: 'restituicao_ir', valorCents: 120_000, previstoPara: '2027-06-30' })).json().item;

    expect((await u.patch(`/v1/creditos/${c.id}`, { status: 'recebido' })).json().item.status).toBe('recebido');
    expect((await u.get('/v1/creditos')).json().creditos).toHaveLength(1);
  });

  it('pendências vêm do provedor de teste com links oficiais', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    const r = (await u.get('/v1/pendencias')).json();

    expect(r.ambiente).toBe('teste');
    expect(Array.isArray(r.pendencias)).toBe(true);
    expect(r.ondeConferir[0].url).toMatch(/^https:\/\//);
  });

  it('assistente usa o modelo quando há chave, com os trechos encontrados', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    const r = (await u.post('/v1/assistente', { pergunta: 'Qual o prazo para pedir restituição de imposto pago a mais?' })).json();

    expect(r.modo).toBe('modelo');
    expect(r.resposta).toContain('[ctn-168]');
    expect(r.fontes.map((f: { id: string }) => f.id)).toContain('ctn-168');
    expect(JSON.stringify(chamadasModelo.at(-1))).toContain('ctn-168');
  });

  it('assistente sem nada encontrado responde sem chamar o modelo', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    const antes = chamadasModelo.length;
    const r = (await u.post('/v1/assistente', { pergunta: 'xyzzy plugh' })).json();

    expect(r).toMatchObject({ modo: 'busca', fontes: [] });
    expect(chamadasModelo.length).toBe(antes);
  });

  it('lista contadores de exemplo e registra pedido de contato', async () => {
    const u = inj((await registerUser(ctx.app)).auth);
    const lista = (await u.get('/v1/contadores?uf=RJ&tema=mei')).json().contadores;

    expect(lista[0]).toMatchObject({ uf: 'RJ', exemplo: true });
    const contato = await u.post(`/v1/contadores/${lista[0].id}/contato`, { assunto: 'mei', mensagem: 'Quero ajuda para abrir meu MEI.' });
    expect(contato.statusCode).toBe(201);
    expect((await u.get('/v1/contadores/contatos')).json().contatos[0]).toMatchObject({ assunto: 'mei', status: 'novo' });
    expect((await u.post('/v1/contadores/00000000-0000-0000-0000-000000000000/contato', { assunto: 'mei', mensagem: 'Quero ajuda para abrir meu MEI.' })).statusCode).toBe(404);
  });

  it('todas as rotas novas exigem login', async () => {
    for (const url of ['/v1/perfil-fiscal', '/v1/notas', '/v1/agenda', '/v1/mei/painel', '/v1/cashback', '/v1/creditos', '/v1/contadores']) {
      expect((await ctx.app.inject(url)).statusCode).toBe(401);
    }
  });
});
