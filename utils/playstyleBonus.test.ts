import { expect, test } from 'vitest';
import { calculateMetaScore, passesNewCandidateFilter, buildDynamicFillOrder, generateOptimalSquad } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';
import { getPlaystyleTier, calculatePlaystyleAndSkillBonus } from './playstyleBonus';

test.each([
 [{ playstylesPlus: [7] }, 'gold'], [{ playstyles_plus: ['7'] }, 'gold'],
 [{ playstyles: [7] }, 'silver'], [{ playstyles: [{ id: '7', isPlus: true }] }, 'gold'],
 [{ card_playstyles: [{ playstyle_id: '7', is_plus: true }] }, 'gold'],
 [{ card_playstyles: [{ playstyles: [{ id: 7 }], is_plus: false }] }, 'silver'],
 [{ playstyles: [7], raw: { card_playstyles: [{ playstyle_id: 7, is_plus: true }] } }, 'gold'],
 [{ card: { raw: { playstylesPlus: [7] } } }, 'gold'], [null, null], [{}, null],
])('tier detection supports raw, joined and normalized cards: %j', (card, tier) => {
 expect(getPlaystyleTier(card, 7)).toBe(tier);
});
const cases = [
 ['ST',38,32,16], ['CF',37,32,16], ['LW',7,32,16], ['CAM',2,24,0], ['ST',3,24,0],
 ['ST',1,26,13], ['RW',6,26,13], ['CAM',1,0,0],
 ['CM',17,30,14], ['CDM',4,30,14], ['CAM',12,30,14], ['CM',27,16,8],
 ['CM',3,16,0], ['CAM',3,24,0], ['CB',8,40,18], ['LCB',24,22,10], ['RCB',10,22,10],
 ['LB',10,20,10], ['RWB',1,20,10], ['GK',33,20,10], ['GK',31,20,10],
] as const;
test.each(cases)('%s playstyle %s gold=%s silver=%s', (pos, id, gold, silver) => {
 expect(calculatePlaystyleAndSkillBonus({ playstylesPlus: [id] }, pos)).toBe(gold);
 expect(calculatePlaystyleAndSkillBonus({ playstyles: [id] }, pos)).toBe(silver);
 expect(calculatePlaystyleAndSkillBonus({ playstyles: [id,id], playstylesPlus: [id,id], card_playstyles: [{ playstyle_id: id, is_plus: true }] }, pos)).toBe(gold);
});
test('stars use attacker-only weights, neutral missing data and normalized aliases', () => {
 expect(calculatePlaystyleAndSkillBonus({ wf: 5, sm: 5 }, 'LS')).toBe(42);
 expect(calculatePlaystyleAndSkillBonus({ wf: '4', sm: '4' }, 'CAM')).toBe(21);
 expect(calculatePlaystyleAndSkillBonus({ wf: 2, sm: 3 }, 'LW')).toBe(-20);
 expect(calculatePlaystyleAndSkillBonus({ wf: 5, sm: 5 }, 'CM')).toBe(0);
 expect(calculatePlaystyleAndSkillBonus({}, 'ST')).toBe(0);
});
test.each(['ST','CAM','CM','CDM','LW','GK'])('silver finesse and power shot add no points at %s', pos => {
 expect(calculatePlaystyleAndSkillBonus({ playstyles: [2,3] }, pos)).toBe(0);
});

const base = { overall: 90, pac: 90, sho: 90, pas: 90, dri: 90, def: 90, phy: 90, card_type: 'gold_rare' };
test('meta score uses tier weights once and fully stacks bonuses beyond 135', () => {
 expect(calculateMetaScore({ ...base, playstyles: [7] }, 'ST')).toBe(106);
 expect(calculateMetaScore({ ...base, playstylesPlus: [7] }, 'ST')).toBe(122);
 expect(calculateMetaScore({ ...base, playstyles: [2,3] }, 'ST')).toBe(calculateMetaScore(base, 'ST'));
 const overloaded = { ...base, sm: 5, wf: 5, playstylesPlus: [1,2,3,4,6,7,8,10,12,17,24,27,31,33,37,38], card_type: 'promo' };
 for (const pos of ['ST','CAM','CM','CDM','CB','LB','GK']) expect(calculateMetaScore(overloaded, pos)).toBeGreaterThan(135);
 // Base 120 + stars 42 + attack traits 144 + passing traits 106.
 expect(calculateMetaScore(overloaded, 'CAM')).toBe(412);
 expect(calculatePlaystyleAndSkillBonus({ playstylesPlus: [37,38,7] }, 'ST')).toBe(96);
 expect(calculatePlaystyleAndSkillBonus({ playstylesPlus: [17,4,12,27], playstyles: [17,4,12,27] }, 'CM')).toBe(106);
 expect(calculateMetaScore({ ...base, overall: 80, pac: 80, sho: 80, dri: 80, phy: 80, playstyles: [2,3] }, 'ST')).toBeLessThan(calculateMetaScore(base, 'ST'));
});
test('CAM pace cut starts at 500k and accepts 79 including formation aliases', () => {
 for (const pos of ['CAM','LAM','RAM']) {
  expect(passesNewCandidateFilter({ pac: 78 }, pos, 499999)).toBe(true);
  expect(passesNewCandidateFilter({ pac: 78 }, pos, 500000)).toBe(false);
  expect(passesNewCandidateFilter({ pac: 79 }, pos, 500000)).toBe(true);
  expect(passesNewCandidateFilter({ pac: 80 }, pos, 500000)).toBe(true);
 }
});
test('empty priorities use all seven default groups with centerbacks before midfield', () => {
 const slots = ['GK','LB','CB','CDM','LW','CAM','ST'].map(position => ({ position }));
 expect(buildDynamicFillOrder(slots).map(slot => slot.position)).toEqual(['ST','CAM','LW','CB','CDM','LB','GK']);
});
test('solver selects gold over silver at equal stats, price and chemistry', async () => {
 const slots = FORMATIONS.find(f => f.name === '4-3-3')!.slots;
 const make = (id, position) => ({ ...base, id, player_id: id, position, price: 30000, leagueId: 100, nationId: 1, clubId: 1 });
 const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'ST').map((s, i) => [s.position,
  { card: { ...make(i, s.position), isIcon: true }, isLocked: true, isOwned: true }]));
 const result = await generateOptimalSquad('4-3-3', { FW: [
  { ...make(100, 'ST'), card_playstyles: [{ playstyle_id: 7, is_plus: false }] },
  { ...make(101, 'ST'), card_playstyles: [{ playstyle_id: 7, is_plus: true }] },
 ], MF: [], DF: [] }, 1000000, 33, false, { currentSquad });
 expect(result.success).toBe(true);
 expect(result.totalChemistry).toBe(33);
 expect(result.squad.find(p => p.slotPosition === 'ST')?.id).toBe('101');
});
