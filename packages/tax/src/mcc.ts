/**
 * MCC (Merchant Category Code, ISO 18245) → categoria do impostômetro.
 * O banco informa o MCC de cada compra no cartão (campo payeeMCC no Open Finance).
 * Ajuste aqui se quiser categorizar diferente; o usuário também pode corrigir cada gasto.
 */
const EXACT: Record<number, string> = {
  // mercado e alimentação em casa
  5411: 'mercado', 5422: 'mercado', 5441: 'mercado', 5451: 'mercado', 5462: 'mercado', 5499: 'mercado',
  // restaurantes e lanches
  5811: 'restaurante', 5812: 'restaurante', 5814: 'restaurante',
  // bebidas
  5813: 'bebidas', 5921: 'bebidas',
  // combustível
  5541: 'combustivel', 5542: 'combustivel', 5983: 'combustivel',
  // transporte
  4111: 'transporte', 4112: 'transporte', 4121: 'transporte', 4131: 'transporte', 4784: 'transporte', 7523: 'transporte',
  // contas da casa
  4900: 'moradia',
  // eletrônicos
  4812: 'eletronicos', 5044: 'eletronicos', 5045: 'eletronicos', 5732: 'eletronicos', 5734: 'eletronicos', 5946: 'eletronicos',
  // vestuário
  5611: 'vestuario', 5621: 'vestuario', 5631: 'vestuario', 5641: 'vestuario', 5651: 'vestuario', 5655: 'vestuario',
  5661: 'vestuario', 5691: 'vestuario', 5699: 'vestuario',
  // saúde
  5122: 'saude', 5912: 'saude', 8011: 'saude', 8021: 'saude', 8042: 'saude', 8043: 'saude', 8062: 'saude', 8071: 'saude', 8099: 'saude',
  // beleza
  5977: 'beleza',
  // serviços
  4814: 'servicos', 4899: 'servicos', 7210: 'servicos', 7230: 'servicos', 7298: 'servicos', 7299: 'servicos',
  7349: 'servicos', 7538: 'servicos', 7542: 'servicos', 8299: 'servicos',
};

export function categoryFromMcc(mcc: number | null | undefined, fallback = 'outros'): string {
  if (mcc == null || !Number.isInteger(mcc)) return fallback;
  return EXACT[mcc] ?? fallback;
}
