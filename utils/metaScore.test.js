import { describe, expect, it } from 'vitest';
import { calculate_base_score } from './metaScore.js';

const stats = { pac: 90, sho: 80, pas: 70, dri: 60, def: 50, phy: 40 };

describe('calculate_base_score', () => {
  it.each([
    ...['ST', 'CF', 'LW', 'RW', 'LM', 'RM'].map(position => [position, false, 75.5]),
    ...['CM', 'CAM', 'CDM'].map(position => [position, false, 66.5]),
    ...['CB', 'LB', 'RB', 'LWB', 'RWB'].map(position => [position, false, 59]),
    ['LM', true, 73], ['RM', true, 73],
  ])('scores %s with three-back=%s', (position, threeBack, expected) => {
    const score = calculate_base_score(stats, { price: 100 }, position, threeBack);
    expect(score.meta_score).toBeCloseTo(expected);
    expect(score.value_score).toBeCloseTo(expected / 100);
  });

  it.each(['ST', 'CF', 'LW', 'RW', 'CM', 'CAM', 'CDM', 'CB', 'LB', 'RB', 'LWB', 'RWB'])(
    'keeps %s weights unchanged across formations', position => {
      expect(calculate_base_score(stats, {}, position, true))
        .toEqual(calculate_base_score(stats, {}, position, false));
    },
  );

  it.each([1, 2, 3, 4, 5])('adds independent bonuses for %s-star weak foot and every skill rating', wf => {
    for (const sm of [1, 2, 3, 4, 5]) {
      const bonuses = [0, 0, 0, 0, 2, 4];
      expect(calculate_base_score(stats, { wf, sm }, 'ST', false).meta_score)
        .toBeCloseTo(75.5 + bonuses[wf] + bonuses[sm]);
    }
  });

  it('never reads overall from either input', () => {
    const overall = { get() { throw new Error('overall must not be read'); } };
    const player = Object.defineProperty({ ...stats }, 'overall', overall);
    const card = Object.defineProperty({ wf: 5, sm: 4, price: 100 }, 'overall', overall);
    expect(calculate_base_score(player, card, 'ST', false))
      .toEqual({ meta_score: 81.5, value_score: 0.815 });
  });

  it.each([0, undefined, null, -1, NaN, Infinity, 'invalid'])('returns zero value for price %s', price => {
    expect(calculate_base_score(stats, { price }, 'ST', false))
      .toEqual({ meta_score: 75.5, value_score: 0 });
  });

  it('accepts numeric strings', () => {
    const player = Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, String(value)]));
    expect(calculate_base_score(player, { wf: '4', sm: '5', price: '100' }, 'LM', true))
      .toEqual({ meta_score: 79, value_score: 0.79 });
  });

  it('handles missing data and invalid stats without NaN', () => {
    expect(calculate_base_score(undefined, undefined, 'ST', false))
      .toEqual({ meta_score: 0, value_score: 0 });
    expect(calculate_base_score({ pac: NaN, sho: Infinity, dri: -1 }, {}, 'ST', false).meta_score).toBe(0);
  });

  it.each(['GK', 'unknown', 'toString'])('rejects unsupported position %s', position => {
    expect(() => calculate_base_score(stats, {}, position, false)).toThrow(RangeError);
  });
});
