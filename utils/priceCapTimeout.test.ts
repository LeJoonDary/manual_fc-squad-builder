import { expect, test, vi } from 'vitest';
import { fetchCandidatePlayers, getPriorityPriceCap, getMaxSlotPrice, generateOptimalSquad,
  getDynamicCandidatesForSlot, STAGE_TIMEOUT_MS } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';
import { createCandidateMockDb } from '../scripts/mocks/candidateDb.js';

test.each([300000, 1000000, 300000.75])('all DB price caps are integers at budget %s', async budget => {
  const positions = FORMATIONS.find(f => f.name === '4-3-1-2')!.slots.map(s => s.position);
  for (const position of positions) expect(Number.isInteger(getPriorityPriceCap(position, budget, [], positions))).toBe(true);
  const db = createCandidateMockDb([]);
  await fetchCandidatePlayers(budget, '4-3-1-2', false, db as any);
  for (const call of db.calls) {
    expect(Number.isInteger(call.max)).toBe(true);
    expect(Number.isInteger(call.min)).toBe(true);
  }
  expect(getPriorityPriceCap('CM', 300000, [], positions)).toBe(60000);
  expect(getMaxSlotPrice('ST', 'balanced', budget, 42000.00000000001)).toBe(42000);
});

test('search can finish after the old 450ms cutoff', async () => {
  expect(STAGE_TIMEOUT_MS).toBeGreaterThanOrEqual(2500);
  const slots = FORMATIONS.find(f => f.name === '4-3-3')!.slots;
  const make = (id, position) => ({ id, player_id: id, position, price: 1000,
    overall: 85, pac: 90, phy: 80, def: 80, leagueId: 100, nationId: 1, clubId: 1 });
  const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'ST').map((s, i) =>
    [s.position, { card: make(i, s.position), isLocked: true, isOwned: true }]));
  let elapsed = -600;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => elapsed += 600);
  try {
    const result = await generateOptimalSquad('4-3-3', { FW: [make(999, 'ST')], MF: [], DF: [] },
      1000000, 33, false, { currentSquad });
    expect(elapsed).toBeGreaterThan(450);
    expect(result.success).toBe(true);
    expect(result.searchStage).toBe(1);
  } finally { clock.mockRestore(); }
});

test('fallback prioritizes legal core links up to five and then releases that preference', () => {
  const make = (id, leagueId, score) => ({ id: String(id), playerKey: String(id), leagueId,
    nationId: id, clubId: id, metaScore: score, price: 1000, isLocked: false });
  const core = make(100, 100, 80), alternative = make(101, 101, 99);
  const squad = Array.from({ length: 4 }, (_, i) => make(i, 100, 90));
  expect(getDynamicCandidatesForSlot('CM', squad as any, [alternative, core] as any, 10000, null, 175, '100')[0].id).toBe('100');
  const saturated = [...squad, make(4, 100, 90)].map(p => ({ ...p, isLocked: true }));
  expect(getDynamicCandidatesForSlot('CM', saturated as any, [core, alternative] as any, 10000, null, 175, '100')[0].id).toBe('101');
});
