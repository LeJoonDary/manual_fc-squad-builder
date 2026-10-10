import { expect, test } from 'vitest';
import { FORMATIONS } from './formations.js';
import { matchesSlotRequirements, passesNewCandidateFilter, calculateMetaScore, generateOptimalSquad } from './autoBuildUtils';

test('slot stars require both minima, including missing values and wrapped cards', () => {
  const req = { minSm: 4, minWf: 5 };
  expect(matchesSlotRequirements({ sm: 4, wf: 5 }, req, 'ST')).toBe(true);
  expect(matchesSlotRequirements({ raw: { sm: 5, wf: 5 } }, req, 'ST')).toBe(true);
  for (const card of [{ sm: 3, wf: 5 }, { sm: 5, wf: 4 }, { sm: 5 }, {}]) {
    expect(matchesSlotRequirements(card, req, 'ST')).toBe(false);
  }
  expect(matchesSlotRequirements({}, { minSm: 0, minWf: 0 }, 'ST')).toBe(true);
});
test.each(['ST', 'CF', 'LM', 'RM', 'LW', 'RW'])('pace floor for %s starts at 500k', position => {
  expect(passesNewCandidateFilter({ pac: 84 }, position, 499999)).toBe(true);
  expect(passesNewCandidateFilter({ pac: 84 }, position, 500000)).toBe(false);
  expect(passesNewCandidateFilter({ pac: 85 }, position, 500000)).toBe(true);
  expect(calculateMetaScore({ pac: 84 }, position)).toBeGreaterThan(0);
});
test.each(['LB', 'RB'])('fullback cap for %s applies from 300k and increases for first priority', position => {
  for (const budget of [300000, 500000]) {
    expect(passesNewCandidateFilter({ price: budget * .15 }, position, budget, ['ST'])).toBe(true);
    expect(passesNewCandidateFilter({ price: budget * .15 + 1 }, position, budget, ['ST'])).toBe(false);
    expect(passesNewCandidateFilter({ price: budget * .35 }, position, budget, ['FB'])).toBe(true);
  }
  expect(passesNewCandidateFilter({ price: 999999 }, position, 0)).toBe(true);
});

test('build and upgrade retain slot star requirements even for a higher rated alternative', async () => {
  const slots = FORMATIONS.find(f => f.name === '4-3-3')!.slots;
  const make = (id, position, overall, sm, wf) => ({ id, player_id: id, position, overall, sm, wf,
    price: 20000, facePace: 90, def: 80, leagueId: 100, nationId: 1, clubId: 1 });
  const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'ST').map((s, i) =>
    [s.position, { card: { ...make(i, s.position, 90, 5, 5), isIcon: true }, isLocked: true, isOwned: true }]));
  const result = await generateOptimalSquad('4-3-3', { FW: [make(100, 'ST', 85, 4, 5), make(101, 'ST', 99, 3, 5), make(102, 'ST', 98, 5, 4)], MF: [], DF: [] },
    1000000, 33, false, { currentSquad, slotRequirements: { ST: { minSm: 4, minWf: 5 } } });
  expect(result.success).toBe(true);
  expect(result.squad.find(p => p.slotPosition === 'ST')?.id).toBe('100');
  expect(result.totalChemistry).toBe(33);
});
