import { expect, test } from 'vitest';
import { getPriorityPriceCap, passesNewCandidateFilter, generateOptimalSquad, fetchCandidatePlayers } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';
import { createCandidateMockDb, mockCandidate } from '../scripts/mocks/candidateDb.js';
const priorities = ['ST','CAM','WIDE','CM','CB','FB','GK'];
test.each([['ST',350000],['CAM',250000],['LW',200000],['CDM',160000],['LCB',130000],['RWB',100000],['GK',80000]])('rank cap for %s has an inclusive boundary', (position, cap) => {
  expect(getPriorityPriceCap(String(position), 1000000, priorities)).toBe(cap);
  expect(passesNewCandidateFilter({ price: cap, pac: 90 }, String(position), 1000000, priorities)).toBe(true);
  expect(passesNewCandidateFilter({ price: Number(cap) + 1, pac: 90 }, String(position), 1000000, priorities)).toBe(false);
});
test('caps start at 300k, preserve unlimited budgets and honor aliases and order', () => {
  for (const budget of [0, 299999]) expect(getPriorityPriceCap('ST', budget, priorities)).toBe(Infinity);
  expect(getPriorityPriceCap('ST', 300000, priorities)).toBe(105000);
  expect(getPriorityPriceCap('ST', 1000000)).toBe(350000);
  expect(getPriorityPriceCap('LB', 1000000)).toBe(100000);
  expect(getPriorityPriceCap('GK', 1000000)).toBe(80000);
  expect(getPriorityPriceCap('RW', 1000000, ['WING', 'MID'])).toBe(350000);
  expect(getPriorityPriceCap('CDM', 1000000, ['WING', 'MID'])).toBe(250000);
  expect(getPriorityPriceCap('ST', 1000000, ['GK', 'ST'])).toBe(250000);
});
test('query cap applies before LIMIT so 120 expensive strikers cannot crowd out an eligible card', async () => {
  const expensive = Array.from({ length: 120 }, (_, i) => mockCandidate(i + 1, ['ST'], 890000, 99));
  const eligible = mockCandidate(999, ['ST'], 350000, 85);
  const db = createCandidateMockDb([...expensive, eligible]);
  const result = await fetchCandidatePlayers(1000000, '4-3-3', false, db as any, { keyPositions: ['ST'] });
  expect(result.map(card => card.id)).toContain(999);
  expect(result.map(card => card.id)).not.toContain(1);
  expect(db.calls.find(call => call.positions.includes('ST')).max).toBe(350000);
});
test('first-priority ST never selects or upgrades to an 890k card; full chemistry and locks survive', async () => {
  const slots = FORMATIONS.find(f => f.name === '4-3-3')!.slots;
  const make = (id, position, overall, price) => ({ id, player_id: id, position, overall, price, facePace: 90, def: 80, leagueId: 100, nationId: 1, clubId: 1 });
  const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'ST').map((s, i) => [s.position,
    { card: { ...make(i, s.position, 90, 890000), isIcon: true }, isLocked: true, isOwned: true }]));
  const result = await generateOptimalSquad('4-3-3', { FW: [make(100, 'ST', 99, 890000), make(101, 'ST', 90, 350000)], MF: [], DF: [] },
    1000000, 33, false, { currentSquad, keyPositions: ['ST'] });
  expect(result.success).toBe(true);
  expect(result.totalChemistry).toBe(33);
  expect(result.squad.find(p => p.slotPosition === 'ST')?.id).toBe('101');
  expect(result.totalCost).toBe(350000);
  expect(result.squad.filter(p => p.isLocked)).toHaveLength(10);
});
