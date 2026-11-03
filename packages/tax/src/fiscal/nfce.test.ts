import { describe, expect, it } from 'vitest';
import { ChaveInvalida, cnpjValido, cpfValido, dvModulo11, lerQrNfce, parseChave } from './nfce.js';

// Chaves válidas montadas para os testes (CNPJ de exemplo 11.222.333/0001-81).
const NFCE = '35261011222333000181650010000123451123456787';
const NFCE_OFFLINE = '35261011222333000181650010000123469876543213';
const NFE_RJ = '33260911222333000181550010000007771111111114';

describe('documentos', () => {
  it.each([
    ['11222333000181', true],
    ['11.222.333/0001-81', true],
    ['11222333000182', false],
    ['11111111111111', false],
    ['123', false],
  ])('CNPJ %s válido? %s', (cnpj, ok) => {
    expect(cnpjValido(cnpj)).toBe(ok);
  });

  it.each([
    ['52998224725', true],
    ['529.982.247-25', true],
    ['52998224724', false],
    ['00000000000', false],
    ['1234', false],
  ])('CPF %s válido? %s', (cpf, ok) => {
    expect(cpfValido(cpf)).toBe(ok);
  });

  it('dígito módulo 11 vira 0 quando o resto é 0 ou 1', () => {
    expect(dvModulo11('0')).toBe(0);
  });
});

describe('chave de acesso', () => {
  it('extrai UF, mês, emitente, modelo, série e número', () => {
    expect(parseChave(NFCE)).toEqual({
      chave: NFCE,
      uf: 'SP',
      anoMes: '2026-10',
      cnpjEmitente: '11222333000181',
      modelo: '65',
      serie: 1,
      numero: 12345,
      tipoEmissao: 1,
    });
  });

  it('aceita a chave com espaços, como vem impressa', () => {
    expect(parseChave(NFCE.replace(/(\d{4})/g, '$1 ')).chave).toBe(NFCE);
  });

  it.each([
    ['tamanho errado', '123', /44 números/],
    ['UF inexistente', '99' + NFCE.slice(2), /estado/],
    ['mês 13', NFCE.slice(0, 4) + '13' + NFCE.slice(6), /Mês/],
    ['modelo que não é nota', NFCE.slice(0, 20) + '57' + NFCE.slice(22), /NFC-e/],
    ['dígito errado', NFCE.slice(0, 43) + '0', /Dígito/],
  ])('recusa %s', (_caso, chave, msg) => {
    expect(() => parseChave(chave)).toThrow(msg);
    expect(() => parseChave(chave)).toThrow(ChaveInvalida);
  });
});

describe('leitura do QR code', () => {
  it('QR v2 online: só a chave, sem valor', () => {
    const r = lerQrNfce(`https://www.nfce.fazenda.sp.gov.br/qrcode?p=${NFCE}|2|1|1|ABCDEF0123`);

    expect(r).toMatchObject({ chave: NFCE, uf: 'SP', valorCents: null, dia: null, cpfNaNota: null });
    expect(r.urlConsulta).toBe('https://www.nfce.fazenda.sp.gov.br/qrcode');
  });

  it('QR v2 em contingência offline traz dia e valor', () => {
    const r = lerQrNfce(`https://www.nfce.fazenda.sp.gov.br/qrcode?p=${NFCE_OFFLINE}|2|1|07|152.37|6e3d|1|ABC`);

    expect(r).toMatchObject({ tipoEmissao: 9, dia: 7, valorCents: 15_237 });
  });

  it('QR v1 traz valor, data e se o CPF foi informado', () => {
    const dhEmi = Array.from('2026-09-12T10:00:00-03:00').map((c) => c.charCodeAt(0).toString(16)).join('');
    const r = lerQrNfce(`http://www4.fazenda.rj.gov.br/consultaNFCe/QRCode?chNFe=${NFE_RJ}&nVersao=100&tpAmb=1&cDest=52998224725&dhEmi=${dhEmi}&vNF=89,90`);

    expect(r).toMatchObject({ uf: 'RJ', modelo: '55', valorCents: 8_990, dia: 12, cpfNaNota: true });
  });

  it('QR v1 sem cDest: nota sem CPF; data em formato inesperado é ignorada', () => {
    const r = lerQrNfce(`http://x.gov.br/q?chNFe=${NFE_RJ}&dhEmi=zz&vNF=0`);

    expect(r).toMatchObject({ cpfNaNota: false, dia: null, valorCents: null });
  });

  it('aceita a chave digitada à mão', () => {
    expect(lerQrNfce(` ${NFCE.slice(0, 22)} ${NFCE.slice(22)} `).chave).toBe(NFCE);
  });

  it.each([
    ['texto qualquer', 'oi tudo bem', /Não reconheci/],
    ['URL de outro QR code', 'https://exemplo.com/?a=1', /não é de nota/],
  ])('recusa %s', (_caso, texto, msg) => {
    expect(() => lerQrNfce(texto)).toThrow(msg);
  });
});
