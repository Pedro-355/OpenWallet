import { describe, expect, it } from 'vitest';
import { lerQrNfce } from '@openwallet/tax';
import { dividirValor, sandboxNfse, sandboxNotaFiscal, sandboxPendencias } from './gov-providers.js';

const NFCE = '35261011222333000181650010000123451123456787';

describe('dividirValor', () => {
  it.each([
    [100, [1, 1, 1]],
    [1, [5, 5]],
    [99_999, [3, 7, 2, 9]],
  ])('%i dividido em %j soma exatamente o total', (total, pesos) => {
    const partes = dividirValor(total, pesos);

    expect(partes).toHaveLength(pesos.length);
    expect(partes.reduce((s, p) => s + p, 0)).toBe(total);
  });
});

describe('consulta de NFC-e no sandbox', () => {
  const provider = sandboxNotaFiscal();

  it('é determinística e os itens somam o total', async () => {
    const leitura = lerQrNfce(NFCE);
    const a = await provider.consultar(leitura);
    const b = await provider.consultar(leitura);

    expect(a).toEqual(b);
    expect(a.itens.reduce((s, i) => s + i.valorCents, 0)).toBe(a.valorCents);
    expect(a.emitidaEm.startsWith('2026-10-')).toBe(true);
  });

  it('respeita valor, dia e CPF quando o QR code informa', async () => {
    const r = await provider.consultar({ ...lerQrNfce(NFCE), valorCents: 5_000, dia: 3, cpfNaNota: true });

    expect(r).toMatchObject({ valorCents: 5_000, emitidaEm: '2026-10-03', cpfNaNota: true });
  });
});

describe('NFS-e no sandbox', () => {
  it('gera chave estável e aceita cancelamento', async () => {
    const p = sandboxNfse();
    const dados = { userId: 'u', numero: 1, valorCents: 100, tomadorDoc: null, descricao: 'x', emitidaEm: '2026-01-01' };

    const a = await p.emitir(dados);

    expect(a).toEqual(await p.emitir(dados));
    expect(a.chave).toMatch(/^NFSE-SANDBOX-[0-9A-F]{50}$/);
    await expect(p.cancelar(a.chave)).resolves.toBeUndefined();
  });
});

describe('pendências no sandbox', () => {
  it('alguns usuários têm pendência de exemplo, outros não', async () => {
    const p = sandboxPendencias();
    const resultados = await Promise.all(Array.from({ length: 40 }, (_, i) => p.consultar(`usuario-${i}`)));

    expect(resultados.some((r) => r.length === 0)).toBe(true);
    const com = resultados.find((r) => r.length > 0)!;
    expect(com[0]).toMatchObject({ orgao: 'Estado', situacao: 'em_aberto' });
    expect(com[0]!.valorCents).toBeGreaterThan(0);
  });
});
