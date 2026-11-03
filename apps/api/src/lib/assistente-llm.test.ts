import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { LlmError, perguntarModelo, type LlmConfig } from './assistente-llm.js';

const BASE = 'https://modelo.teste';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const cfg = (o: Partial<LlmConfig> = {}): LlmConfig => ({ apiKey: 'k', model: 'modelo-x', baseUrl: BASE, timeoutMs: 1_000, ...o });
const prompt = { system: 'sistema', user: 'pergunta' };

describe('perguntarModelo', () => {
  it('envia chave, versão e modelo, e junta os blocos de texto da resposta', async () => {
    let recebido: { headers: Headers; body: unknown } | null = null;
    server.use(
      http.post(`${BASE}/v1/messages`, async ({ request }) => {
        recebido = { headers: request.headers, body: await request.json() };
        return HttpResponse.json({ content: [{ type: 'text', text: 'Olá ' }, { type: 'tool_use' }, { type: 'text', text: 'mundo' }] });
      }),
    );

    expect(await perguntarModelo(cfg(), prompt)).toBe('Olá mundo');
    expect(recebido!.headers.get('x-api-key')).toBe('k');
    expect(recebido!.headers.get('anthropic-version')).toBe('2023-06-01');
    expect(recebido!.body).toMatchObject({ model: 'modelo-x', system: 'sistema', messages: [{ role: 'user', content: 'pergunta' }] });
  });

  it('erro HTTP vira LlmError', async () => {
    server.use(http.post(`${BASE}/v1/messages`, () => HttpResponse.json({}, { status: 529 })));

    await expect(perguntarModelo(cfg(), prompt)).rejects.toThrow(/529/);
  });

  it('resposta sem texto vira LlmError', async () => {
    server.use(http.post(`${BASE}/v1/messages`, () => HttpResponse.json({})));

    await expect(perguntarModelo(cfg(), prompt)).rejects.toBeInstanceOf(LlmError);
  });

  it('desiste quando passa do tempo limite', async () => {
    server.use(
      http.post(`${BASE}/v1/messages`, async () => {
        await delay(500);
        return HttpResponse.json({ content: [{ type: 'text', text: 'tarde demais' }] });
      }),
    );

    await expect(perguntarModelo(cfg({ timeoutMs: 20 }), prompt)).rejects.toThrow(/falha ao chamar o modelo/);
  });

  it('usa o fetch injetado quando informado', async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'injetado' }] }))) as unknown as typeof fetch;

    expect(await perguntarModelo(cfg({ fetchFn }), prompt)).toBe('injetado');
  });
});
