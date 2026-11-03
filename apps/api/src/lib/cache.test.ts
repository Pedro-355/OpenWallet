import { describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import { Cache } from './cache.js';

/** Dublê de Redis em memória: só o que o Cache usa. */
function fakeRedis(status = 'ready') {
  const store = new Map<string, string>();
  const redis = {
    status,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
    multi: vi.fn(() => {
      const ops: (() => void)[] = [];
      const chain = {
        incr: (k: string) => (ops.push(() => store.set(k, String(Number(store.get(k) ?? 0) + 1))), chain),
        expire: () => chain,
        exec: async () => ops.forEach((op) => op()),
      };
      return chain;
    }),
  };
  return { redis: redis as unknown as Redis, mock: redis, store };
}
const log = () => ({ warn: vi.fn() });

describe('Cache', () => {
  it('grava e lê JSON com TTL', async () => {
    const { redis, mock } = fakeRedis();
    const cache = new Cache(redis, log());
    await cache.setJSON('k', { a: 1 }, 60);
    expect(mock.set).toHaveBeenCalledWith('k', '{"a":1}', 'EX', 60);
    await expect(cache.getJSON('k')).resolves.toEqual({ a: 1 });
  });

  it('versão do usuário começa em "0" e sobe a cada gravação (invalida o cache antigo)', async () => {
    const cache = new Cache(fakeRedis().redis, log());
    await expect(cache.userVersion('u1')).resolves.toBe('0');
    await cache.bumpUser('u1');
    await cache.bumpUser('u1');
    await expect(cache.userVersion('u1')).resolves.toBe('2');
    await expect(cache.userVersion('u2')).resolves.toBe('0');
  });

  describe('falha aberta (o app segue funcionando sem Redis)', () => {
    it('sem Redis configurado, nada quebra', async () => {
      const cache = new Cache(null, log());
      await expect(cache.getJSON('k')).resolves.toBeNull();
      await expect(cache.setJSON('k', 1, 1)).resolves.toBeUndefined();
      await expect(cache.userVersion('u')).resolves.toBe('0');
      await expect(cache.bumpUser('u')).resolves.toBeUndefined();
    });

    it('Redis desconectado: nem tenta chamar', async () => {
      const { redis, mock } = fakeRedis('reconnecting');
      await new Cache(redis, log()).getJSON('k');
      expect(mock.get).not.toHaveBeenCalled();
    });

    it('erro do Redis vira aviso no log e resposta vazia', async () => {
      const { redis, mock } = fakeRedis();
      mock.get.mockRejectedValueOnce(new Error('timeout'));
      const logger = log();
      await expect(new Cache(redis, logger).getJSON('k')).resolves.toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ op: 'get' }), expect.any(String));
    });

    it('valor corrompido no cache é ignorado', async () => {
      const { redis, store } = fakeRedis();
      store.set('k', '{não é json');
      await expect(new Cache(redis, log()).getJSON('k')).resolves.toBeNull();
    });
  });
});
