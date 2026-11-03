/**
 * Cliente mínimo da API de mensagens da Anthropic para redigir as respostas do assistente.
 * Só é usado quando ASSISTENTE_API_KEY está configurada.
 */

export interface LlmConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  /** Para testes. Padrão: fetch global. */
  fetchFn?: typeof fetch;
}

export class LlmError extends Error {}

export async function perguntarModelo(cfg: LlmConfig, prompt: { system: string; user: string }): Promise<string> {
  const fetchFn = cfg.fetchFn ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const res = await fetchFn(`${cfg.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 600,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new LlmError(`modelo respondeu ${res.status}`);
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const texto = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim();
    if (!texto) throw new LlmError('resposta vazia do modelo');
    return texto;
  } catch (err) {
    if (err instanceof LlmError) throw err;
    throw new LlmError(`falha ao chamar o modelo: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
