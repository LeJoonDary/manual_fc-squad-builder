import { expect, test } from 'vitest';
import { getMrvSlotOrder, hasSlotConstraints, generateOptimalSquad, getAvailableCardPositions,
  matchesSlotRequirements, passesNewCandidateFilter } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';
import fixture from '../scripts/mocks/mrvCandidates.json';

test('keeps ordinary slots in position order regardless of pool size', () => {
  const slots = ['ST', 'CAM', 'LCM', 'CM', 'RCM', 'CB', 'GK'].map(position => ({ position }));
  const pools = [100, 200, 8, 3, 15, 8, 80].map(count => Array(count).fill(null));
  expect(getMrvSlotOrder(slots, pools, new Set())).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(getMrvSlotOrder(slots, pools, new Set([3]))).toEqual([0, 1, 2, 4, 5, 6]);
  expect(getMrvSlotOrder(slots, pools, new Set(), { slotRequirements: { GK: { minWf: 3 } } }))
    .toEqual([6, 0, 1, 2, 3, 4, 5]);
});

test('recognizes supported PlayStyle, Role and star requirements without treating empty settings as constraints', () => {
  for (const requirement of [{ playstyles: [{ id: 1, name: 'Pinged Pass', isPlus: true }] },
    { playstyle: { idOrName: 1, isPlus: false } }, { roles: [{ name: 'Playmaker', minLevel: 2 as const }] },
    { minSm: 4 }, { minWf: 5 }]) {
    expect(hasSlotConstraints('CM', { slotRequirements: { CM: requirement } })).toBe(true);
  }
  expect(hasSlotConstraints('CM', { slotRequirements: { CM: { roles: [], playstyles: [] } } })).toBe(false);
  expect(hasSlotConstraints('CM', { slotRoleRequirements: { CM: { roleName: 'Playmaker', minLevel: 2 } } })).toBe(true);
});

test('prioritizes three Pinged Pass+ CMs and completes 33 chemistry without locks or special cards', async () => {
  const layout = FORMATIONS.find(f => f.name === '4-3-1-2')!;
  const pools = layout.slots.map(({ position }) => fixture.candidates.filter(card =>
    getAvailableCardPositions(card).includes(['LCM', 'RCM'].includes(position) ? 'CM'
      : ['LS', 'RS'].includes(position) ? 'ST' : ['LCB', 'RCB'].includes(position) ? 'CB' : position)
    && matchesSlotRequirements(card, fixture.options.slotRequirements[position], position)
    && passesNewCandidateFilter(card, position, 1000000, layout.slots.map(s => s.position), { maxPriceCap: Infinity })));
  const order = getMrvSlotOrder(layout.slots, pools, new Set(), fixture.options);
  expect(order.slice(0, 3).map(i => layout.slots[i].position)).toEqual(['LCM', 'CM', 'RCM']);
  const result = await generateOptimalSquad('4-3-1-2', fixture.candidates as any, 1000000, 33, true, fixture.options);
  expect(result.success).toBe(true);
  expect(result.totalChemistry).toBe(33);
  expect(result.totalCost).toBeLessThanOrEqual(1000000);
  expect(result.squad.some(p => p.isLocked || p.isIcon || p.isHero)).toBe(false);
  const midfield = result.squad.filter(p => ['LCM', 'CM', 'RCM'].includes(p.slotPosition));
  expect(midfield.map(p => p.id).sort()).toEqual(['11', '8', '88']);
  expect(midfield.reduce((sum, player) => sum + player.price, 0)).toBe(469000);
  expect(midfield.every(p => matchesSlotRequirements(p.card, fixture.options.slotRequirements.CM, p.slotPosition))).toBe(true);
});


test('keeps attackers first with three locks and midfield first with seven locks', () => {
  const slots = FORMATIONS.find(f => f.name === '4-3-1-2')!.slots;
  const pools = slots.map((_, i) => Array(i + 1).fill(null));
  const positions = (locked: number[]) => getMrvSlotOrder(slots, pools, new Set(locked))
    .map(i => slots[i].position);
  expect(positions([1, 6, 7])).toEqual(['LS', 'CAM', 'LCM', 'CM', 'RCM', 'RCB', 'RB', 'GK']);
  expect(positions([0, 1, 2, 4, 6, 7, 10])).toEqual(['LCM', 'RCM', 'RCB', 'RB']);
});
