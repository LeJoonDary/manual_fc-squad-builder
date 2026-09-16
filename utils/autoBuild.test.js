import { describe, expect, it } from 'vitest';
import { redistributeBudgetRatios } from './autoBuild.js';

describe('redistributeBudgetRatios', () => {
  it('redistributes proportionally without mutating the previous state', () => {
    const previous = { FW: 40, MF: 35, DF: 25 };
    expect(redistributeBudgetRatios(previous, 'FW', 52)).toEqual({ FW: 52, MF: 28, DF: 20 });
    expect(previous).toEqual({ FW: 40, MF: 35, DF: 25 });
  });

  it('splits evenly when the other groups have no budget', () => {
    expect(redistributeBudgetRatios({ FW: 100, MF: 0, DF: 0 }, 'FW', 39))
      .toEqual({ FW: 39, MF: 31, DF: 30 });
  });

  it('keeps integer percentages totaling 100 across repeated changes and endpoints', () => {
    let ratios = { FW: 40, MF: 35, DF: 25 };
    for (const group of ['FW', 'MF', 'DF', 'FW']) {
      for (let value = 0; value <= 100; value++) {
        ratios = redistributeBudgetRatios(ratios, group, value);
        expect(ratios[group]).toBe(value);
        expect(Object.values(ratios).reduce((sum, ratio) => sum + ratio, 0)).toBe(100);
        expect(Object.values(ratios).every(ratio => Number.isInteger(ratio) && ratio >= 0 && ratio <= 100)).toBe(true);
      }
    }
  });
});
