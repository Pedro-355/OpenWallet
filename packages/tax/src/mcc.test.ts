import { describe, expect, it } from 'vitest';
import { categoryFromMcc } from './mcc.js';
import { loadRatesFile } from './node.js';

describe('categoryFromMcc', () => {
  it.each([
    [5411, 'mercado'],
    [5812, 'restaurante'],
    [5813, 'bebidas'],
    [5541, 'combustivel'],
    [4121, 'transporte'],
    [4900, 'moradia'],
    [5732, 'eletronicos'],
    [5651, 'vestuario'],
    [5912, 'saude'],
    [5977, 'beleza'],
    [7230, 'servicos'],
  ])('MCC %i → %s', (mcc, categoria) => {
    expect(categoryFromMcc(mcc)).toBe(categoria);
  });

  it.each([null, undefined, 1234, 5411.5, Number.NaN])('MCC %s → categoria padrão', (mcc) => {
    expect(categoryFromMcc(mcc as number)).toBe('outros');
    expect(categoryFromMcc(mcc as number, 'x')).toBe('x');
  });

  it('toda categoria produzida pelo MCC existe na tabela de alíquotas', () => {
    const table = loadRatesFile();
    for (let mcc = 0; mcc <= 9999; mcc++) {
      expect(table.categories[categoryFromMcc(mcc)], `MCC ${mcc}`).toBeDefined();
    }
  });
});
