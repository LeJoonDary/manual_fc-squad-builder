import { expect, test } from 'vitest';
import { getConstraintBudgetGroup, getConstraintSlotCap, withinConstraintBudget,
  generateOptimalSquad, refineCompletedSquad, type GeneratedPlayer } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';
import fixture from '../scripts/mocks/mrvCandidates.json';

const requirements = (positions: string[]) => ({ slotRequirements: Object.fromEntries(positions.map(p =>
  [p, { playstyles: [{ id: 38, name: 'Gamechanger', isPlus: false }] }])) });
const player = (slotPosition: string, price: number) => ({ slotPosition, price, isLocked: false } as GeneratedPlayer);

test('classifies CAM as attack and LM/RM as midfield, including formation aliases', () => {
  for (const pos of ['LS', 'RS', 'CF', 'LW', 'RW', 'CAM']) expect(getConstraintBudgetGroup(pos)).toBe('FW');
  for (const pos of ['LCM', 'CM', 'RCM', 'CDM', 'LM', 'RM']) expect(getConstraintBudgetGroup(pos)).toBe('MF');
  for (const pos of ['LCB', 'RB', 'LB', 'LWB', 'RWB', 'GK']) expect(getConstraintBudgetGroup(pos)).toBe('DF');
});

test('enforces 30% per slot and 50% per group while separating unrelated groups and plain slots', () => {
  const options = requirements(['LS', 'RS', 'CAM', 'LCM', 'CM', 'RCM']);
  expect(getConstraintSlotCap('LS', [], 1000000, options)).toBe(300000);
  expect(getConstraintSlotCap('RS', [player('LS', 300000)], 1000000, options)).toBe(200000);
  expect(withinConstraintBudget([player('LS', 300000), player('RS', 200001)], 1000000, options)).toBe(false);
  expect(withinConstraintBudget([player('LS', 300000), player('RS', 200000)], 1000000, options)).toBe(true);
  const midfield = [player('LCM', 239000), player('CM', 197000), player('RCM', 33000)];
  expect(withinConstraintBudget(midfield, 1000000, options)).toBe(true);
  expect(getConstraintSlotCap('CAM', midfield, 1000000, options)).toBe(300000);
  expect(getConstraintSlotCap('LS', [player('GK', 400000)], 1000000, options)).toBe(300000);
  expect(getConstraintSlotCap('GK', midfield, 1000000, options)).toBe(Infinity);
  expect(getConstraintSlotCap('LS', [], 0, options)).toBe(Infinity);
});

test('single Gamechanger ST rejects an 850k star and selects a legal attacker in a full build', async () => {
  const options = { ...requirements(['LS']), maxIcons: 0, maxHeroes: 0 };
  const pajor = fixture.candidates.find(c => String(c.id) === '22')!;
  const star = { ...pajor, id: 999999, player_id: 999999, price: 850000, overall: 99,
    players: { ...pajor.players, id: 999999, name: 'Over-budget striker' },
    card_playstyles: [{ playstyle_id: 38, is_plus: true }] };
  const ids = new Set(['22', '20277', '12', '8', '88', '11', '586', '141', '20440', '65', '4']);
  const candidates = [...fixture.candidates.filter(c => ids.has(String(c.id))).map(c =>
    ['8', '11'].includes(String(c.id)) ? { ...c, price: 50000 } : c), star];
  const result = await generateOptimalSquad('4-3-1-2', candidates as any, 1000000, 33, true, options);
  expect(result.success).toBe(true);
  const striker = result.squad.find(p => p.slotPosition === 'LS')!;
  expect(striker.price).toBeLessThanOrEqual(300000);
  expect(striker.id).not.toBe('999999');
  expect(result.totalCost).toBeLessThanOrEqual(1000000);
}, 15000);

test('direct solver and completed refinement cannot bypass a constrained ST cap', async () => {
  const slots = FORMATIONS.find(f => f.name === '4-3-1-2')!.slots;
  const card = (id: number, position: string, price: number, metaScore = 90) => ({ id, player_id: id,
    position, price, overall: 90, pac: 90, sho: 90, pas: 90, dri: 90, def: 90, phy: 90,
    nationId: 'n', clubId: 'c', leagueId: 'l', meta_score: metaScore, playstyles: [{ id: 38 }] });
  const currentSquad = slots.map((s, i) => i === 0 ? null : { card: { ...card(i, s.position, 1000), isIcon: true }, isLocked: true, isOwned: true });
  const options = { ...requirements(['LS']), currentSquad };
  const result = await generateOptimalSquad('4-3-1-2', { FW: [card(100, 'ST', 131000), card(101, 'ST', 850000, 99)], MF: [], DF: [] }, 1000000, 33, true, options);
  expect(result.success).toBe(true);
  const striker = result.squad.find(p => !p.isLocked)!;
  expect(striker.id).toBe('100');
  const upgrade = { ...striker, id: '101', playerKey: '101', price: 850000, metaScore: 99, card: card(101, 'ST', 850000, 99) };
  expect(refineCompletedSquad(result.squad, 869000, 1000000, [upgrade], true, 33, options).squad).toEqual(result.squad);
});
