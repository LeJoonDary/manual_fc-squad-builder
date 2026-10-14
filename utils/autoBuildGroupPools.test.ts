import { expect, test } from 'vitest';
import { buildDynamicFillOrder, fitsAnchorBudgetCaps, generateOptimalSquad, generateTopAnchorSets, getDynamicGroupBudgetCap } from './autoBuildUtils';
import { effectivePriorityGroups } from './priorityGroups.js';
import { FORMATIONS } from './formations.js';
import { normalizeChemistryPosition } from './chemistry';

const slots = FORMATIONS.find(f => f.name === '4-3-1-2')!.slots;
const positions = slots.map(s => s.position);
const make = (id: number, position: string, overall = 90, price = 1000) => ({
  id, player_id: id, position, overall, price, pac: overall, sho: overall, pas: overall,
  dri: overall, def: overall, phy: overall, nationId: 'n', leagueId: 'l', clubId: 'c',
});
const locks = (open: string[]) => Object.fromEntries(slots
  .filter(s => !open.includes(normalizeChemistryPosition(s.position)))
  .map((s, i) => [s.position, { card: make(i, s.position), isLocked: true, isOwned: true }]));

test.each([1, 2, 3])('top five %i-slot sets match exhaustive summed-score ranking', count => {
  const cards = [400000, 200000, 125000, 70000, 40000, 20000].map((price, i) => ({
    ...make(i, 'CM', 99 - i, price), id: String(i), playerKey: String(i), metaScore: 100 - i * i,
  }));
  const expected: Array<{ ids: string[]; score: number; cost: number }> = [];
  const enumerate = (chosen: typeof cards, start: number) => {
    if (chosen.length === count) {
      const cost = chosen.reduce((sum, p) => sum + p.price, 0);
      if (cost <= 525000) expected.push({ ids: chosen.map(p => p.id), cost,
        score: chosen.reduce((sum, p) => sum + p.metaScore, 0) });
      return;
    }
    for (let i = start; i < cards.length; i++) enumerate([...chosen, cards[i]], i + 1);
  };
  enumerate([], 0);
  expected.sort((a, b) => b.score - a.score || a.cost - b.cost || a.ids.join('|').localeCompare(b.ids.join('|')));
  const result = generateTopAnchorSets(Array.from({ length: count }, () => [...cards].reverse()) as any, 525000);
  expect(result.map(set => set.map(p => p.id).sort())).toEqual(expected.slice(0, 5).map(set => set.ids));
});

test('sets preserve different slot eligibility and reject duplicate player versions', () => {
  const prepared = (id: string, playerKey: string, metaScore: number) => ({ id, playerKey, metaScore, price: 1000 });
  const result = generateTopAnchorSets([
    [prepared('a', 'same', 100), prepared('b', 'other', 90)],
    [prepared('c', 'same', 99)],
  ] as any, 525000);
  expect(result.map(set => set.map(p => p.id))).toEqual([['b', 'c']]);
});

test('preserves wingless defaults and appends omitted groups after custom priorities', () => {
  expect(effectivePriorityGroups([], positions)).toEqual(['ST', 'CAM', 'CM', 'CB', 'FB', 'GK']);
  expect(effectivePriorityGroups(['CM (CDM)', 'FULLBACKS'], positions))
    .toEqual(['CM', 'FB', 'ST', 'CAM', 'CB', 'GK']);
  expect(buildDynamicFillOrder(slots, ['CM', 'FB']).map(s => normalizeChemistryPosition(s.position)))
    .toEqual(['CM', 'CM', 'CM', 'LB', 'RB', 'ST', 'ST', 'CAM', 'CB', 'CB', 'GK']);
});

test('all seven ranks have fixed caps independent of remaining slots', () => {
  const priorities = ['ST', 'CAM', 'WINGS', 'CM', 'CB', 'FB', 'GK'];
  expect(priorities.map(p => getDynamicGroupBudgetCap(p, priorities, 1000000)))
    .toEqual([525000, 325000, 220000, 160000, 130000, 100000, 80000]);
  expect(getDynamicGroupBudgetCap('GK', priorities, 0)).toBe(Infinity);
});

test('default ST pair spends one fixed pool without equal per-player limits', async () => {
  const result = await generateOptimalSquad('4-3-1-2', { FW: [
    make(100, 'ST', 99, 400000), make(101, 'ST', 98, 200000), make(102, 'ST', 95, 125000),
  ], MF: [], DF: [] }, 1000000, 33, false, { currentSquad: locks(['ST']) });
  expect(result.success).toBe(true);
  expect(result.squad.filter(p => !p.isLocked).map(p => p.id).sort()).toEqual(['100', '102']);
  expect(result.totalCost).toBe(525000);
});

test('pair generation includes affordable partners beyond the old top-40 slice', async () => {
  const expensive = Array.from({ length: 40 }, (_, i) => make(100 + i, 'ST', 99 - i / 100, 400000));
  const result = await generateOptimalSquad('4-3-1-2', {
    FW: [...expensive, make(200, 'ST', 90, 100000)], MF: [], DF: [],
  }, 1000000, 33, false, { currentSquad: locks(['ST']) });
  expect(result.success).toBe(true);
  expect(result.searchStage).toBe(1);
  expect(result.squad.filter(p => !p.isLocked).map(p => p.id).sort()).toEqual(['100', '200']);
});

test('fifth-priority fullbacks share 130k, including the upgrade pass', async () => {
  const result = await generateOptimalSquad('4-3-1-2', { FW: [], MF: [], DF: [
    make(100, 'LB', 99, 280000), make(101, 'LB', 95, 70000), make(102, 'LB', 90, 60000),
    make(103, 'RB', 95, 70000), make(104, 'RB', 90, 60000),
  ] }, 1000000, 33, false, { currentSquad: locks(['LB', 'RB']) });
  expect(result.success).toBe(true);
  expect(result.totalCost).toBe(130000);
  expect(result.squad.some(p => p.id === '100')).toBe(false);
  expect(fitsAnchorBudgetCaps(result.squad, 1000000)).toBe(true);
  const over = result.squad.map(p => !p.isLocked ? { ...p, price: 70000 } : p);
  expect(fitsAnchorBudgetCaps(over, 1000000)).toBe(false);
});
