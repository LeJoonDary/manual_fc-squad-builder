import { expect, test } from 'vitest';
import { passesNewCandidateFilter, calculateMetaScore } from './autoBuildUtils';

test.each([0, 100000, 299999, 300000, 499999, 500000, 1000000])('hard caps hold at budget %s', budget => {
  for (const pos of ['CM', 'CDM', 'LCM', 'RDM']) {
    for (const stats of [{ def: 69 }, { faceDefending: 69 }, { player_stats: [{ def: 69 }] }]) {
      expect(passesNewCandidateFilter({ pac: 90, ...stats }, pos, budget)).toBe(false);
    }
    expect(passesNewCandidateFilter({ pac: 90, def: 70 }, pos, budget)).toBe(true);
  }
  for (const pos of ['ST', 'CF', 'LS', 'RS']) {
    expect(passesNewCandidateFilter({ pac: 62, phy: 90 }, pos, budget)).toBe(false);
    expect(passesNewCandidateFilter({ pac: 81, phy: 90 }, pos, budget)).toBe(false);
    expect(passesNewCandidateFilter({ pac: 82, phy: budget >= 500000 ? 70 : 66 }, pos, budget)).toBe(true);
    expect(passesNewCandidateFilter({ pac: 82, phy: budget >= 500000 ? 69 : 65 }, pos, budget)).toBe(false);
  }
  for (const pos of ['LB', 'RB', 'LWB', 'RWB']) {
    expect(passesNewCandidateFilter({ pac: 81, phy: 90 }, pos, budget)).toBe(false);
    expect(passesNewCandidateFilter({ pac: 82, phy: 62 }, pos, budget)).toBe(budget < 500000);
    expect(passesNewCandidateFilter({ pac: 82, phy: 65 }, pos, budget)).toBe(true);
  }
  expect(passesNewCandidateFilter({ pac: 69 }, 'CB', budget)).toBe(false);
  expect(passesNewCandidateFilter({ pac: 70 }, 'CB', budget)).toBe(true);
  expect(passesNewCandidateFilter({ pac: 74 }, 'CB', budget)).toBe(true);
});

test('alternate-position cards compete on the assigned slot score without a primary bonus', () => {
  const base = { overall: 90, pac: 90, sho: 90, pas: 90, dri: 90, def: 80, phy: 80 };
  for (const pos of ['ST', 'CAM']) {
    expect(calculateMetaScore({ ...base, position: 'LW', playstylesPlus: [7] }, pos))
      .toBeGreaterThan(calculateMetaScore({ ...base, position: pos }, pos));
  }
});
