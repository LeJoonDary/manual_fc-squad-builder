import { describe, expect, it } from 'vitest';
import { calculateBudgetStatus } from './budget';

describe('calculateBudgetStatus', () => {
  it('treats a zero budget as unlimited', () => {
    expect(calculateBudgetStatus(2_000_000, 0)).toEqual({
      percentage: 0, displayPercentage: 0, overAmount: 0, level: 'unlimited',
    });
  });

  it('changes level at the 80 and 100 percent boundaries', () => {
    expect(calculateBudgetStatus(799_999, 1_000_000).level).toBe('safe');
    expect(calculateBudgetStatus(800_000, 1_000_000).level).toBe('warning');
    expect(calculateBudgetStatus(1_000_000, 1_000_000).level).toBe('warning');
  });

  it('returns the over-budget amount and caps the visual bar', () => {
    expect(calculateBudgetStatus(1_250_000, 1_000_000)).toEqual({
      percentage: 125, displayPercentage: 100, overAmount: 250_000, level: 'over',
    });
  });
});
