/** Estabelecimentos fictícios com o MCC (Merchant Category Code) que um banco de verdade informaria. */
export const MERCHANTS: { name: string; mcc: number; min: number; max: number; weight: number }[] = [
  { name: 'SUPERMERCADO BOM PRECO', mcc: 5411, min: 3500, max: 48000, weight: 10 },
  { name: 'PADARIA PAO DOURADO', mcc: 5462, min: 800, max: 4500, weight: 8 },
  { name: 'POSTO AVENIDA COMBUSTIVEIS', mcc: 5541, min: 8000, max: 30000, weight: 6 },
  { name: 'RESTAURANTE SABOR CASEIRO', mcc: 5812, min: 2500, max: 12000, weight: 7 },
  { name: 'LANCHONETE ESQUINA', mcc: 5814, min: 1500, max: 5000, weight: 6 },
  { name: 'BAR DO CHICO', mcc: 5813, min: 2000, max: 15000, weight: 3 },
  { name: 'CORRIDA APP*VIAGEM', mcc: 4121, min: 900, max: 6000, weight: 7 },
  { name: 'FARMACIA SAUDE TOTAL', mcc: 5912, min: 1200, max: 18000, weight: 4 },
  { name: 'ELETRO CENTER LOJA 12', mcc: 5732, min: 9000, max: 350000, weight: 1 },
  { name: 'MODA VIVA CONFECCOES', mcc: 5651, min: 5000, max: 40000, weight: 2 },
  { name: 'PASSO FIRME CALCADOS', mcc: 5661, min: 9000, max: 45000, weight: 1 },
  { name: 'PERFUMARIA BELEZA PURA', mcc: 5977, min: 2500, max: 20000, weight: 2 },
  { name: 'SALAO ESTILO & CIA', mcc: 7230, min: 4000, max: 15000, weight: 1 },
  { name: 'DISTRIBUIDORA DE ENERGIA', mcc: 4900, min: 9000, max: 40000, weight: 1 },
  { name: 'CONVENIENCIA 24H', mcc: 5499, min: 600, max: 6000, weight: 4 },
];

const totalWeight = MERCHANTS.reduce((s, m) => s + m.weight, 0);

export function randomMerchant() {
  let r = Math.random() * totalWeight;
  for (const m of MERCHANTS) {
    r -= m.weight;
    if (r <= 0) return m;
  }
  return MERCHANTS[0]!;
}

export const randomInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));
