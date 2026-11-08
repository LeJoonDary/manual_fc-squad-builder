import { expect, test } from 'vitest';
import fixture from '../scripts/mocks/mrvCandidates.json';
import { calculateDynamicSlotCap, generateOptimalSquad, refineCompletedSquad } from './autoBuildUtils';

const formation = ['LS', 'RS', 'CAM', 'LCM', 'CM', 'RCM', 'LB', 'LCB', 'RCB', 'RB', 'GK'];

test.each(['LS', 'RS'])('caps either unlocked striker %s at an equal quarter of the budget', position => {
  expect(calculateDynamicSlotCap(position, formation, 1000000, false, 1000000, formation)).toBe(250000);
});

test('selecting a cheap automatic partner does not release its unused share', () => {
  expect(calculateDynamicSlotCap('RS', ['RS'], 999000, false, 1000000, formation,
    [{ slotPosition: 'LS', price: 1000 }])).toBe(250000);
});

test('a locked or owned free partner retains the single striker exception', () => {
  for (const partner of [
    { slotPosition: 'RS', price: 0, isLocked: true },
    { slotPosition: 'RS', price: 0, isOwned: true },
  ]) {
    expect(calculateDynamicSlotCap('LS', ['LS'], 300000, false, 300000, formation, [partner])).toBe(150000);
  }
  expect(calculateDynamicSlotCap('LS', ['LS'], 280000, false, 300000, formation,
    [{ slotPosition: 'RS', price: 20000, isLocked: true }])).toBe(130000);
});

test('remaining budget and unlimited mode are respected', () => {
  expect(calculateDynamicSlotCap('LS', ['LS', 'RS'], 5000, false, 1000000, formation)).toBe(4000);
  expect(calculateDynamicSlotCap('LS', formation, Infinity, true, 0, formation)).toBe(Infinity);
});


test('an elite 498k striker cannot bypass the cap during construction or refinement', async () => {
  const source = fixture.candidates.find(card => card.id === 22)!;
  const expensive = { ...source, id: 999999, player_id: 999999, price: 498000,
    card_positions: source.card_positions.map(position => ({ ...position, meta_score: 120 })) };
  const result = await generateOptimalSquad('4-3-1-2', [...fixture.candidates, expensive] as any,
    1000000, 33, true, fixture.options);
  expect(result.success).toBe(true);
  expect(result.totalChemistry).toBe(33);
  expect(result.squad.some(p => p.id === '999999')).toBe(false);
  expect(result.squad.filter(p => ['LS', 'RS'].includes(p.slotPosition))
    .every(p => p.price >= 100000 && p.price <= 250000)).toBe(true);
});


test('a multi-position upgrade cannot bypass the striker cap through a CAM pool entry', async () => {
  const result = await generateOptimalSquad('4-3-1-2', fixture.candidates as any, 1000000, 33, true, fixture.options);
  const squad = result.squad.map(player => ({ ...player, price: 1000 }));
  const partner = squad.find(player => player.slotPosition === 'RS')!;
  const upgrade = { ...partner, id: 'over-cap', playerKey: 'over-cap', slotPosition: 'CAM', price: 275000,
    card: { ...partner.card, id: 'over-cap', player_id: 'over-cap', price: 275000,
      card_positions: [{ positions: { name: 'ST' }, is_primary: true, meta_score: 120 }] } };
  const refined = refineCompletedSquad(squad, 989000, 1000000, [upgrade], true, 33, fixture.options);
  expect(refined.squad.some(player => player.id === 'over-cap')).toBe(false);
});
