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
 ['ST',38,4,2], ['CF',37,4,2], ['ST',7,4,2], ['ST',2,3,0], ['ST',3,3,0], ['CF',3,3,0], ['CAM',3,3,0], ['CDM',3,3,0],
 ['ST',1,3,1.5], ['ST',6,3,1.5], ['ST',27,2,1], ['ST',4,2,1], ['ST',17,2,1],
 ['CAM',4,4,2], ['CAM',17,4,2], ['CAM',7,4,2], ['CAM',27,2,1], ['CAM',2,2,0],
 ['CM',17,4,2], ['CDM',4,4,2], ['CM',7,3,1.5], ['CM',27,3,1.5], ['CM',9,2.5,1.3], ['CDM',8,2.5,1.3], ['CM',24,2.5,1.3], ['CDM',1,2.5,1.3],
 ['CB',8,4,2], ['LCB',24,3.5,1.8], ['RCB',10,3,1.5], ['CB',9,2,1],
 ['LB',10,3,1.5], ['RWB',1,3.5,1.8], ['RB',6,3.5,1.8], ['LWB',9,3,1.5], ['LB',8,3,1.5], ['GK',33,3,1.5], ['GK',31,3,1.5],
 ['ST',5,0,0], ['CM',12,3.5,1.8], ['CAM',12,3.5,1.8], ['CAM',38,2.5,1.3], ['CAM',37,2.5,1.3], ['CM',3,3,0], ['CB',11,0,0], ['CAM',1,0,0],
] as const;
test.each(cases)('%s playstyle %s gold=%s silver=%s', (pos, id, gold, silver) => {
 expect(calculatePlaystyleAndSkillBonus({ playstylesPlus: [id] }, pos)).toBe(gold);
 expect(calculatePlaystyleAndSkillBonus({ playstyles: [id] }, pos)).toBe(silver);
 expect(calculatePlaystyleAndSkillBonus({ playstyles: [id,id], playstylesPlus: [id,id], card_playstyles: [{ playstyle_id: id, is_plus: true }] }, pos)).toBe(gold);
});
test.each(['ST', 'CF', 'CAM', 'CM', 'CDM'])('Power Shot name matching awards only gold at %s', pos => {
 expect(calculatePlaystyleAndSkillBonus({ playstyles: [{ name: 'Power Shot', is_plus: true }] }, pos)).toBe(3);
 expect(calculatePlaystyleAndSkillBonus({ playstyles: [{ name: 'Power Shot', is_plus: false }] }, pos)).toBe(0);
});
test.each(['LW', 'RW', 'LM', 'RM', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'GK'])('Power Shot gold awards no bonus outside target positions at %s', pos => {
 expect(calculatePlaystyleAndSkillBonus({ playstylesPlus: [3] }, pos)).toBe(0);
});

test('stars use precise weights, neutral missing data and normalized aliases', () => {
 expect(calculatePlaystyleAndSkillBonus({ wf: 5, sm: 5 }, 'LS')).toBe(5);
 expect(calculatePlaystyleAndSkillBonus({ wf: '4', sm: '4' }, 'CAM')).toBe(2.5);
 expect(calculatePlaystyleAndSkillBonus({ wf: 2, sm: 3 }, 'LW')).toBe(0);
 expect(calculatePlaystyleAndSkillBonus({ wf: 5, sm: 5 }, 'CM')).toBe(5);
 expect(calculatePlaystyleAndSkillBonus({}, 'ST')).toBe(0);
});
test.each(['ST','CAM','CM','CDM','LW','GK'])('silver finesse awards no bonus at %s', pos => {
 expect(calculatePlaystyleAndSkillBonus({ playstyles: [2,3] }, pos)).toBe(0);
});

const base = { overall: 90, pac: 90, sho: 90, pas: 90, dri: 90, def: 90, phy: 90, card_type: 'gold_rare' };
test('meta scores stack the exact bonuses once, including goalkeeper traits', () => {
 expect(calculateMetaScore({ ...base, playstyles: [7] }, 'ST')).toBe(92);
 expect(calculateMetaScore({ ...base, playstylesPlus: [7] }, 'ST')).toBe(94);
 expect(calculateMetaScore({ ...base, playstylesPlus: [33,31] }, 'GK')).toBe(96);
 expect(calculatePlaystyleAndSkillBonus({ playstylesPlus: [37,38,7] }, 'ST')).toBe(12);
 expect(calculatePlaystyleAndSkillBonus({ playstylesPlus: [17,4,12,27], playstyles: [17,4,12,27] }, 'CM')).toBe(14.5);
 expect(calculatePlaystyleAndSkillBonus({ weak_foot: 5, skill_moves: 4, playstyles: [{ name: 'Tiki-Taka', isPlus: true }] }, 'CM')).toBe(8);
});

test('CAM pace cut applies at every budget and accepts 79 including formation aliases', () => {
 for (const pos of ['CAM','LAM','RAM']) {
  expect(passesNewCandidateFilter({ overall: 85, pac: 78 }, pos, 299999)).toBe(false);
  expect(passesNewCandidateFilter({ overall: 85, pac: 78 }, pos, 0)).toBe(false);
  expect(passesNewCandidateFilter({ overall: 85, pac: 78 }, pos, 300000)).toBe(false);
  expect(passesNewCandidateFilter({ overall: 85, pac: 79 }, pos, 300000)).toBe(true);
  expect(passesNewCandidateFilter({ overall: 85, pac: 80 }, pos, 300000)).toBe(true);
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
