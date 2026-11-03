/**
 * Leitura do QR code da NFC-e (modelo 65) e da chave de acesso de 44 dígitos (NF-e/NFC-e).
 *
 * Chave: cUF(2) AAMM(4) CNPJ(14) modelo(2) série(3) número(9) tpEmis(1) código(8) DV(1)
 * QR code v2 (NT 2015.002 v1.50+):
 *   online:  ...?p=CHAVE|2|tpAmb|idCSC|hash
 *   offline: ...?p=CHAVE|2|tpAmb|dia|vNF|digVal|idCSC|hash   (traz o valor da nota)
 * QR code v1 (antigo): ...?chNFe=CHAVE&nVersao=100&tpAmb=1&cDest=CPF&dhEmi=...&vNF=12.34&...
 */
import type { UF } from '../index.js';

export const UF_POR_CODIGO_IBGE: Record<string, UF> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA',
  '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
  '41': 'PR', '42': 'SC', '43': 'RS',
  '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
};

/** Dígito verificador módulo 11, pesos 2..9 da direita para a esquerda. */
export function dvModulo11(digitos: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = digitos.length - 1; i >= 0; i--) {
    soma += Number(digitos[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (base: string, pesos: number[]) => {
    const s = pesos.reduce((acc, p, i) => acc + Number(base[i]) * p, 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  const d1 = calc(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[12]) && d2 === Number(d[13]);
}

export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export interface ChaveAcesso {
  chave: string;
  uf: UF;
  /** AAAA-MM da emissão. */
  anoMes: string;
  cnpjEmitente: string;
  /** 65 = NFC-e (cupom), 55 = NF-e. */
  modelo: '55' | '65';
  serie: number;
  numero: number;
  /** 1 = normal; 9 = contingência offline (NFC-e). */
  tipoEmissao: number;
}

export class ChaveInvalida extends Error {}

export function parseChave(raw: string): ChaveAcesso {
  const chave = raw.replace(/\D/g, '');
  if (chave.length !== 44) throw new ChaveInvalida('A chave de acesso tem 44 números.');
  const uf = UF_POR_CODIGO_IBGE[chave.slice(0, 2)];
  if (!uf) throw new ChaveInvalida('Código de estado inválido na chave.');
  const aa = Number(chave.slice(2, 4));
  const mm = Number(chave.slice(4, 6));
  if (mm < 1 || mm > 12) throw new ChaveInvalida('Mês de emissão inválido na chave.');
  const modelo = chave.slice(20, 22);
  if (modelo !== '55' && modelo !== '65') throw new ChaveInvalida('Não é uma NF-e nem uma NFC-e.');
  if (dvModulo11(chave.slice(0, 43)) !== Number(chave[43])) {
    throw new ChaveInvalida('Dígito verificador não confere: confira se a chave foi digitada certo.');
  }
  return {
    chave,
    uf,
    anoMes: `20${String(aa).padStart(2, '0')}-${String(mm).padStart(2, '0')}`,
    cnpjEmitente: chave.slice(6, 20),
    modelo,
    serie: Number(chave.slice(22, 25)),
    numero: Number(chave.slice(25, 34)),
    tipoEmissao: Number(chave[34]),
  };
}

export interface LeituraQr extends ChaveAcesso {
  /** Valor total, quando o QR code traz (contingência offline ou versão 1). */
  valorCents: number | null;
  /** Dia da emissão, quando o QR code traz. */
  dia: number | null;
  /** true/false quando o QR code diz; null quando não dá para saber pelo QR. */
  cpfNaNota: boolean | null;
  /** Endereço de consulta na SEFAZ (para o usuário abrir). */
  urlConsulta: string | null;
}

const toCents = (v: string | undefined | null) => {
  if (!v) return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

/** Aceita o texto lido do QR code (URL), ou só a chave de 44 dígitos (com ou sem espaços). */
export function lerQrNfce(texto: string): LeituraQr {
  const t = texto.trim();
  const soDigitos = t.replace(/[\s.-]/g, '');
  if (/^\d{44}$/.test(soDigitos)) {
    return { ...parseChave(soDigitos), valorCents: null, dia: null, cpfNaNota: null, urlConsulta: null };
  }
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    throw new ChaveInvalida('Não reconheci esse código. Use o QR code da nota ou digite a chave de 44 números.');
  }
  const urlConsulta = `${url.origin}${url.pathname}`;
  const p = url.searchParams.get('p');
  if (p) {
    const partes = p.split('|');
    const chave = parseChave(partes[0] ?? '');
    const offline = partes.length >= 8;
    return {
      ...chave,
      valorCents: offline ? toCents(partes[4]) : null,
      dia: offline ? Number(partes[3]) || null : null,
      cpfNaNota: null,
      urlConsulta,
    };
  }
  const chNFe = url.searchParams.get('chNFe');
  if (chNFe) {
    const dhEmi = url.searchParams.get('dhEmi');
    let dia: number | null = null;
    if (dhEmi && /^[0-9a-f]+$/i.test(dhEmi)) {
      // Na versão 1 a data vem em hexadecimal do texto ISO.
      const iso = (dhEmi.match(/../g) ?? []).map((h) => String.fromCharCode(parseInt(h, 16))).join('');
      dia = Number(iso.slice(8, 10)) || null;
    }
    return {
      ...parseChave(chNFe),
      valorCents: toCents(url.searchParams.get('vNF')),
      dia,
      cpfNaNota: url.searchParams.has('cDest') ? Boolean(url.searchParams.get('cDest')) : false,
      urlConsulta,
    };
  }
  throw new ChaveInvalida('Esse QR code não é de nota fiscal.');
}
