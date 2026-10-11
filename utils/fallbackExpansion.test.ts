import { expect, test } from 'vitest';
import { generateOptimalSquad, fetchCandidatePlayers } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';
import { createCandidateMockDb, mockCandidate } from '../scripts/mocks/candidateDb.js';

const slots = FORMATIONS.find(f => f.name === '4-3-3')!.slots;
const make = (id: number, position: string) => ({ id, player_id: id, position, price: 1000,
  overall: 85, pac: 90, phy: 80, def: 80, wf: 4, nationId: 1, leagueId: 100, clubId: 1 });
const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'ST').map((s, i) =>
  [s.position, { card: make(i, s.position), isLocked: true, isOwned: true }]));
const isolated = Array.from({ length: 150 }, (_, i) => ({ ...make(100 + i, 'ST'), pac: 99, nationId: 9, leagueId: 101, clubId: 9 }));
const bridge = make(999, 'ST');
const run = (cards: any[], extra = {}) => generateOptimalSquad('4-3-3', { FW: cards, MF: [], DF: [] },
  1000000, 33, false, { currentSquad, slotRequirements: { ST: { minWf: 4 } }, ...extra });

test('primary succeeds without running the expanded pass', async () => {
  const result = await run([bridge]);
  expect(result.success).toBe(true);
  expect(result.searchStage).toBe(1);
  expect(result.stageAttempts[1]).toBe(0);
});

test('failed top 100 expands to 175 and finds a chemistry bridge beyond old DB limit', async () => {
  const result = await run([...isolated, bridge], { excludedCardVersionIds: [100, 101, 102] });
  expect(result.searchStage).toBe(2);
  expect(result.success).toBe(true);
  expect(result.totalChemistry).toBe(33);
  expect(result.squad.find(p => p.slotPosition === 'ST')?.id).toBe('999');
  expect(result.squad.filter(p => p.isLocked)).toHaveLength(10);
  expect(result.stageAttempts[0]).toBeLessThanOrEqual(500);
  expect(result.stageAttempts[1]).toBeLessThanOrEqual(400);
  expect(result.totalCost).toBeLessThanOrEqual(1000000);
});

test.each([
  { excludedCardVersionIds: [999] },
  { slotRequirements: { ST: { minWf: 5 } } },
])('fallback preserves exclusions and advanced requirements %j', async extra => {
  const result = await run([...isolated, bridge], extra);
  expect(result.searchStage).toBe(2);
  expect(result.success).toBe(false);
  expect(result.squad.some(p => p.id === '999')).toBe(false);
});

test('fallback does not reinstate a physically invalid striker', async () => {
  const result = await run([...isolated, { ...bridge, phy: 69 }]);
  expect(result.searchStage).toBe(2);
  expect(result.success).toBe(false);
  expect(result.totalChemistry).toBeLessThan(33);
});

test.each([174, 175])('expanded pool respects its exact 175-card boundary with %s distractors', async count => {
  const distractors = Array.from({ length: count }, (_, i) => ({ ...isolated[0], id: 2000 + i, player_id: 2000 + i }));
  const result = await run([...distractors, bridge]);
  expect(result.searchStage).toBe(2);
  expect(result.success).toBe(count === 174);
});

test('DB fetch retains 175 cards after exclusion before search-stage slicing', async () => {
  const rows = Array.from({ length: 180 }, (_, i) => mockCandidate(1000 + i, ['ST'], 1000, 85));
  const db = createCandidateMockDb(rows);
  const candidates = await fetchCandidatePlayers(1000000, '4-3-3', false, db as any,
    { currentSquad, excludedCardVersionIds: [1000, 1001] });
  expect(db.calls[0].limit).toBe(175);
  expect(candidates.filter(c => Number(c.id) >= 1000)).toHaveLength(175);
  expect(candidates.some(c => c.id === 1176)).toBe(true);
  expect(candidates.some(c => c.id === 1000)).toBe(false);
});
