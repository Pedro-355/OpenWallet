import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Cache com "fail-open": se o Redis cair, a API continua respondendo (só fica mais lenta).
 * Invalidação por versão: cada usuário tem um contador; ao gravar um gasto o contador
 * sobe e as chaves antigas simplesmente deixam de ser lidas (e expiram pelo TTL).
 */
export class Cache {
  constructor(
    private readonly redis: Redis | null,
    private readonly log: FastifyBaseLogger,
  ) {}

  private async safe<T>(op: string, fn: (r: Redis) => Promise<T>): Promise<T | null> {
    if (!this.redis || this.redis.status !== 'ready') return null;
    try {
      return await fn(this.redis);
    } catch (err) {
      this.log.warn({ err, op }, 'cache indisponível, seguindo sem cache');
      return null;
    }
  }

  async userVersion(userId: string): Promise<string> {
    return (await this.safe('get-version', (r) => r.get(`uv:${userId}`))) ?? '0';
  }

  async bumpUser(userId: string): Promise<void> {
    await this.safe('bump-version', async (r) => {
      await r.multi().incr(`uv:${userId}`).expire(`uv:${userId}`, 60 * 60 * 24 * 30).exec();
    });
  }

  async getJSON<T>(key: string): Promise<T | null> {
    const raw = await this.safe('get', (r) => r.get(key));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJSON(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.safe('set', (r) => r.set(key, JSON.stringify(value), 'EX', ttlSeconds));
  }
}
