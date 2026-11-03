import { describe, expect, it } from 'vitest';
import { DUMMY_HASH, hashPassword, newOpaqueToken, sha256, verifyPassword } from './crypto.js';

describe('senhas (scrypt)', () => {
  it('confere a senha certa e recusa a errada', async () => {
    const hash = await hashPassword('senha-forte-123');
    await expect(verifyPassword('senha-forte-123', hash)).resolves.toBe(true);
    await expect(verifyPassword('senha-forte-124', hash)).resolves.toBe(false);
  });

  it('usa sal aleatório: a mesma senha gera hashes diferentes', async () => {
    const [a, b] = await Promise.all([hashPassword('x'), hashPassword('x')]);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  it('nunca guarda a senha em texto puro', async () => {
    expect(await hashPassword('minha-senha')).not.toContain('minha-senha');
  });

  it.each(['', 'bcrypt$...', 'scrypt$1$2$3', 'texto-qualquer'])('recusa hash em formato desconhecido: "%s"', async (stored) => {
    await expect(verifyPassword('x', stored)).resolves.toBe(false);
  });

  it('DUMMY_HASH (usado quando o e-mail não existe) nunca confere', async () => {
    await expect(verifyPassword('', DUMMY_HASH)).resolves.toBe(false);
    await expect(verifyPassword('qualquer', DUMMY_HASH)).resolves.toBe(false);
  });
});

describe('tokens', () => {
  it('gera tokens opacos únicos, seguros para URL', () => {
    const tokens = new Set(Array.from({ length: 200 }, newOpaqueToken));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('sha256 é determinístico e tem 32 bytes', () => {
    expect(sha256('a').equals(sha256('a'))).toBe(true);
    expect(sha256('a')).toHaveLength(32);
  });
});
