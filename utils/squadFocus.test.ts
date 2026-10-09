import { expect, it } from 'vitest';
import { getFocusWeight, getElasticSlotCap, getMaxSlotPrice, getSlotEvaluationOrder, fetchCandidatePlayers, generateOptimalSquad,
  getPositionBudgetGroup, type CandidateGroups, type SquadFocus } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';
import { createCandidateMockDb, mockCandidate } from '../scripts/mocks/candidateDb.js';
import type { SupabaseClient } from '@supabase/supabase-js';

it.each([
  ['ST', .35, .30, .25, 1.3, 1], ['CF', .55, .30, .25, 1.3, 1],
  ['LW', .20, .30, .25, 1.2, 1], ['RW', .20, .30, .25, 1.2, 1],
  ['CAM', .40, .30, .25, 1.2, 1], ['LM', .40, .30, .25, 1.2, 1], ['RM', .40, .30, .25, 1.2, 1],
  ['LCB', .50, .30, .45, 1, 1.3], ['RCB', .50, .30, .45, 1, 1.3],
  ['LCM', .12, .30, .35, 1, 1.2], ['CDM', .12, .30, .35, 1, 1.2],
  ['LB', .02, .09, .12, 1, 1], ['RB', .02, .09, .12, 1, 1],
  ['LWB', .02, .09, .12, 1, 1], ['RWB', .02, .09, .12, 1, 1], ['GK', .015, .09, .25, 1, 1],
] as const)('applies the cap and score matrix for %s', (position, attack, balanced, defense, attackWeight, defenseWeight) => {
  for (const [focus, ratio] of [['attack', attack], ['balanced', balanced], ['defense', defense]] as const) {
    expect(getMaxSlotPrice(position, focus, 1000000, 1000000)).toBe(["LCB", "RCB"].includes(position) ? (focus === "attack" ? 200000 : focus === "defense" ? 450000 : 300000) : ["LB", "RB", "LWB", "RWB", "GK"].includes(position) ? 80000 : Math.floor(ratio * 1000000 * (["ST", "CF", "LW", "RW", "CAM", "LM", "RM"].includes(position) ? 1.7 : ["LCB", "RCB"].includes(position) ? 1.4 : ["LCM", "CDM"].includes(position) ? 1 : .85)));
    expect(getMaxSlotPrice(position, focus, 1000000, 1234)).toBe(1234);
    expect(getMaxSlotPrice(position, focus, 0, Infinity)).toBe(Infinity);
    expect(getMaxSlotPrice(position, focus, 1000000, 0)).toBe(0);
  }
  expect(getFocusWeight(position, 'attack')).toBe(attackWeight);
  expect(getFocusWeight(position, 'balanced')).toBe(1);
  expect(getFocusWeight(position, 'defense')).toBe(defenseWeight);
});

it('normalizes striker aliases, preserves equal-priority order and puts unknown positions last', () => {
  const positions = ['LW', 'RCB', 'LS', 'LCB', 'RS', 'LWB', 'unknown'];
  expect(getSlotEvaluationOrder('attack', positions)).toEqual(['LS', 'RS', 'LW', 'RCB', 'LCB', 'LWB', 'unknown']);
  expect(getSlotEvaluationOrder('defense', positions)).toEqual(['RCB', 'LCB', 'LS', 'RS', 'LWB', 'LW', 'unknown']);
  expect(positions[0]).toBe('LW');
});

it.each(['attack', 'balanced', 'defense'] as const)('uses the focus caps in DB queries before limiting rows: %s', async focus => {
  const db = createCandidateMockDb([
    mockCandidate(1, ['ST', 'LW'], 550000, 90),
    mockCandidate(2, ['LB'], 120000, 90),
    mockCandidate(3, ['CB'], 450000, 90),
  ]);
  await fetchCandidatePlayers(1000000, '4-3-3', false, db as unknown as SupabaseClient, { focus });
  for (const call of db.calls) {
    expect(call.max).toBe(getMaxSlotPrice(call.positions[0], focus, 1000000, 1000000));
    expect(call.limit).toBe(120);
  }
});

it.each(['attack', 'balanced', 'defense'] as const)('produces distinct allocations from the same candidates without exceeding caps: %s', async focus => {
  const slots = FORMATIONS.find(item => item.name === '4-3-3')!.slots;
  const make = (id: number, position: string, price: number, score: number) => ({
    id, player_id: id, position, price, overall: score, nationId: 1, leagueId: 1 + id % 3, clubId: 1,
    player_stats: { pac: score, sho: score, pas: score, dri: score, def: score, phy: score, composure: score },
  });
  const currentSquad = Object.fromEntries(slots.filter(slot => !['ST', 'LW', 'LCB'].includes(slot.position))
    .map((slot, i) => [slot.position, { card: make(i, slot.position, 100000, 80), isLocked: true, isOwned: true }]));
  const rows = [make(100, 'ST', 1000, 70), make(101, 'LW', 1000, 70), make(102, 'CB', 1000, 70),
    make(110, 'ST', 350000, 99), make(111, 'ST', 300000, 90), make(112, 'ST', 250000, 85),
    make(120, 'CB', 500000, 99), make(121, 'CB', 450000, 95), make(122, 'CB', 300000, 90),
    make(130, 'LW', 400000, 99), make(131, 'LW', 300000, 90), make(132, 'LW', 250000, 85), make(133, 'LW', 200000, 84)];
  // Focus still constrains candidate prices; complete squads use the same global formula.
  const expected = { attack: [110, 131, 102], balanced: [110, 131, 122], defense: [110, 131, 122] };
  for (const input of [rows, [...rows].reverse()]) {
    const groups: CandidateGroups = { FW: [], MF: [], DF: [] };
    input.forEach(row => groups[getPositionBudgetGroup(row.position, false)].push(row));
    const result = await generateOptimalSquad('4-3-3', groups, 1000000, 30, false, { focus, currentSquad });
    expect(result.success).toBe(true);
    expect(['ST', 'LW', 'LCB'].map(position => Number(result.squad.find(p => p.slotPosition === position)?.id))).toEqual(expected[focus]);
    expect(result.totalCost).toBeLessThanOrEqual(1000000);
    expect(result.squad.filter(p => p.isLocked)).toHaveLength(8);
    for (const player of result.squad.filter(p => !p.isLocked)) {
      expect(player.price).toBeLessThanOrEqual(getMaxSlotPrice(player.slotPosition, focus, 1000000, 1000000));
    }
  }
});

it('rejects an invalid focus instead of silently switching its policy', () => {
  expect(() => getSlotEvaluationOrder('invalid' as SquadFocus, [])).toThrow('Unknown squad focus');
  expect(() => getMaxSlotPrice('ST', 'invalid' as SquadFocus, 1000, 1000)).toThrow('Unknown squad focus');
});

it.each([500000, 1000000])('enforces Attack midfield and fixed defensive caps at budget %s', async budget => {
  for (const position of ['CM', 'LCM', 'RCM', 'CDM', 'LDM', 'RDM']) {
    expect(getMaxSlotPrice(position, 'attack', budget, budget)).toBe(budget * .12);
  }
  expect(getMaxSlotPrice('GK', 'attack', budget, budget)).toBe(budget * .08);
  for (const position of ['LB', 'RB', 'LWB', 'RWB']) {
    expect(getMaxSlotPrice(position, 'attack', budget, budget)).toBe(budget * .08);
  }
  const db = createCandidateMockDb([
    mockCandidate(1, ['CM'], budget * .12, 85), mockCandidate(2, ['CM'], budget * .12 + 1, 99),
    mockCandidate(3, ['GK'], budget * .08, 85), mockCandidate(4, ['GK'], budget * .08 + 1, 99),
    mockCandidate(5, ['LB'], budget * .08, 85), mockCandidate(6, ['LB'], budget * .08 + 1, 99),
  ]);
  const candidates = await fetchCandidatePlayers(budget, '4-3-3', false, db as unknown as SupabaseClient, { focus: 'attack' });
  expect(candidates.map(p => p.id).sort()).toEqual([1, 3, 5]);
});

it.each([['ST', 17000], ['CAM', 17000], ['LW', 17000], ['RCB', 14000], ['LCM', 10000], ['GK', 8500], ['LWB', 8500]] as const)(
  'applies elastic multiplier for %s', (position, cap) => {
    expect(getElasticSlotCap(position, 10000, 100000, 3)).toBe(cap);
    expect(getElasticSlotCap(position, 10000, 5000, 3)).toBe(2000);
    expect(getElasticSlotCap(position, 10000, 500, 3)).toBe(0);
    expect(getElasticSlotCap(position, 10000, 500, 0)).toBe(500);
  });
