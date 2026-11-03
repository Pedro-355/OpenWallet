import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const minimal = { DATABASE_URL: 'postgres://u@localhost/db', JWT_SECRET: 'x'.repeat(32) };

describe('loadConfig', () => {
  it('aplica padrões seguros', () => {
    const c = loadConfig(minimal);
    expect(c).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      DB_POOL_MAX: 10,
      RATE_LIMIT_MAX: 300,
      RUN_WORKER: false,
      SANDBOX_BANK: false,
      PUBLIC_URL: 'http://localhost:3000',
    });
    expect(c.OPENFINANCE_BASE_URL).toBeUndefined();
  });

  it('converte números e booleanos vindos do ambiente', () => {
    const c = loadConfig({ ...minimal, PORT: '8080', RUN_WORKER: '1', TRUST_PROXY: 'false' });
    expect(c).toMatchObject({ PORT: 8080, RUN_WORKER: true, TRUST_PROXY: false });
  });

  it('lista todos os problemas de uma vez, com mensagem legível', () => {
    let message = '';
    try {
      loadConfig({ JWT_SECRET: 'curto', PORT: 'abc' });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/^Configuração inválida:/);
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('PORT');
    expect(message).toContain('JWT_SECRET precisa ter pelo menos 32 caracteres');
  });

  it('usa RENDER_EXTERNAL_URL como endereço público quando existir', () => {
    expect(loadConfig({ ...minimal, RENDER_EXTERNAL_URL: 'https://app.onrender.com' }).PUBLIC_URL).toBe('https://app.onrender.com');
  });

  describe('modo Banco Sandbox embutido', () => {
    it('aponta o provedor para o próprio servidor e deriva o retorno do consentimento', () => {
      const c = loadConfig({ ...minimal, SANDBOX_BANK: 'true', PORT: '4321', PUBLIC_URL: 'https://meu-pc.ts.net' });
      expect(c.OPENFINANCE_PROVIDER).toBe('sandbox');
      expect(c.OPENFINANCE_BASE_URL).toBe('http://127.0.0.1:4321/sandbox-bank');
      expect(c.OPENFINANCE_REDIRECT_URL).toBe('https://meu-pc.ts.net/openfinance/callback');
    });

    it('gera segredos aleatórios quando não informados', () => {
      const a = loadConfig({ ...minimal, SANDBOX_BANK: 'true' });
      const b = loadConfig({ ...minimal, SANDBOX_BANK: 'true' });
      expect(a.OPENFINANCE_WEBHOOK_SECRET.length).toBeGreaterThanOrEqual(32);
      expect(a.OPENFINANCE_WEBHOOK_SECRET).not.toBe(b.OPENFINANCE_WEBHOOK_SECRET);
    });

    it('respeita valores informados explicitamente', () => {
      const c = loadConfig({
        ...minimal,
        SANDBOX_BANK: 'true',
        OPENFINANCE_WEBHOOK_SECRET: 'meu-segredo',
        OPENFINANCE_REDIRECT_URL: 'https://outro/cb',
        CORS_ORIGINS: 'https://a',
        SERVE_WEB_DIR: 'dist',
      });
      expect(c).toMatchObject({ OPENFINANCE_WEBHOOK_SECRET: 'meu-segredo', OPENFINANCE_REDIRECT_URL: 'https://outro/cb', CORS_ORIGINS: 'https://a' });
    });

    it('servindo a tela no mesmo endereço, libera CORS só para ele', () => {
      const c = loadConfig({ ...minimal, SANDBOX_BANK: 'true', SERVE_WEB_DIR: 'dist', PUBLIC_URL: 'https://x.ts.net' });
      expect(c.CORS_ORIGINS).toBe('https://x.ts.net');
    });
  });
});
