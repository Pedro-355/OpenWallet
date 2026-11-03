import { describe, expect, it } from 'vitest';
import { retryDelaySeconds } from './queue.js';

describe('retryDelaySeconds (espera exponencial da fila)', () => {
  it.each([
    [1, 10],
    [2, 20],
    [3, 40],
    [8, 1280],
    [9, 2560],
    [10, 3600], // teto de 1h
    [50, 3600],
  ])('tentativa %i → %is', (attempt, seconds) => {
    expect(retryDelaySeconds(attempt)).toBe(seconds);
  });

  it('nunca é negativa nem zero', () => {
    expect(retryDelaySeconds(0)).toBe(10);
    expect(retryDelaySeconds(-3)).toBe(10);
  });
});
