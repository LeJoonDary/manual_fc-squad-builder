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
      percentage: 100, displayPercentage: 100, overAmount: 250_000, level: 'over',
    });
  });
});
import { parseBudgetInput, safeBudgetNumber, formatBudgetNumber } from './budget';
it.each(['', 'abc', 'NaN', 'Infinity', '9'.repeat(400)])('invalid or overflowing budget input %s becomes finite zero', value => {
 expect(parseBudgetInput(value)).toBe(0);
});
it('accepts formatted input and backspacing without NaN', () => {
 for (const [value, expected] of [['300,000',300000],['30,000',30000],['',0],['200,000 C',200000]] as const) {
  expect(parseBudgetInput(value)).toBe(expected);
 }
});
it.each([NaN, Infinity, -Infinity, undefined])('guards invalid derived values %s', value => {
 expect(safeBudgetNumber(value)).toBe(0);
 expect(formatBudgetNumber(value)).toBe('0');
 const status=calculateBudgetStatus(value as number, value as number);
 expect(Object.values(status).filter(v=>typeof v==='number').every(Number.isFinite)).toBe(true);
});
it('caps ratio before multiplication, even with enormous cost and tiny target',()=>{
 expect(calculateBudgetStatus(Number.MAX_VALUE,Number.MIN_VALUE)).toMatchObject({percentage:100,displayPercentage:100,level:'over'});
});
