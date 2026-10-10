import { expect, test } from 'vitest';
import { adaptChemistryPlayerCard } from './chemistry';
import { FORMATIONS } from './formations.js';
import { calculateMetaScore, calculateSquadChemistry, passesNewCandidateFilter, upgradeSquadToTargetBudgetRatio } from './autoBuildUtils';

const make = (id: number, position: string, price: number, rating = 80, locked = false) => {
 const card = { id, player_id: id, position, overall: rating, price, pac: 90, sho: rating, pas: rating,
  dri: rating, def: rating, phy: rating, league_id: 100, nation_id: 1, club_id: 1, isIcon: locked };
 return { ...adaptChemistryPlayerCard(card), card, id: String(id), playerKey: String(id), slotPosition: position,
  price, isLocked: locked, isOwned: false, metaScore: calculateMetaScore(card, position) };
};
function fixture() {
 const open = ['ST','LW','RB'];
 const squad = FORMATIONS.find(f => f.name === '4-3-3')!.slots.map((s, i) => make(i + 1, s.position, open.includes(s.position) ? 1000 : 50000, 80, !open.includes(s.position)));
 const pools = { ST: [make(101,'ST',300000,95)], LW: [make(102,'LW',100000,95)], RB: [make(103,'RB',60000,95)] };
 return { squad, pools };
}
test('multiple upgrades take 403k to 860k while preserving 33 chemistry, paid locks and inputs', () => {
 const { squad, pools } = fixture();
 const snapshot = structuredClone({ squad, pools });
 expect(calculateSquadChemistry(squad, false).totalChemistry).toBe(33);
 const result = upgradeSquadToTargetBudgetRatio(squad, 1000000, pools, false);
 expect(result.reduce((sum,p) => sum + p.price,0)).toBe(860000);
 expect(calculateSquadChemistry(result, false).totalChemistry).toBe(33);
 expect(result.filter(p => !p.isLocked).map(p => p.id)).toEqual(expect.arrayContaining(['101','102','103']));
 expect(result.filter(p => p.isLocked)).toEqual(squad.filter(p => p.isLocked));
 expect({ squad, pools }).toEqual(snapshot);
});
test('no valid upgrade terminates without spending on weaker, duplicate, excluded or over-cap cards', () => {
 const { squad } = fixture();
 const weak = make(100,'ST',300000,70);
 const duplicate = { ...make(101,'ST',300000,99), playerKey: squad.find(p => p.slotPosition === 'LW')!.playerKey };
 const tooCostly = make(102,'ST',890000,99);
 const excluded = make(103,'ST',300000,99);
 const slow = make(104,'ST',300000,99); slow.card.pac = 84;
 const wrongPosition = make(105,'CB',300000,99); wrongPosition.slotPosition = 'ST';
 const result = upgradeSquadToTargetBudgetRatio(squad,1000000,{ST:[weak,duplicate,tooCostly,excluded,slow,wrongPosition]},false,{excludedCardVersionIds:[103]});
 expect(result).toBe(squad);
});
test('unlimited, already-spent and incomplete squads do not trigger upgrades', () => {
 const { squad,pools } = fixture();
 expect(upgradeSquadToTargetBudgetRatio(squad,0,pools,false)).toBe(squad);
 expect(upgradeSquadToTargetBudgetRatio(squad,450000,pools,false)).toBe(squad);
 const incomplete = squad.slice(1);
 expect(upgradeSquadToTargetBudgetRatio(incomplete,1000000,pools,false)).toBe(incomplete);
});
test.each(['CM','CDM','CB','LCM','RCM','LDM','RDM','LCB','RCB'])('%s pace floor begins at 300k and includes 70', pos => {
 expect(passesNewCandidateFilter({ pac: 62, overall: 99 },pos,299999)).toBe(true);
 expect(passesNewCandidateFilter({ pac: 69, overall: 99 },pos,300000)).toBe(false);
 expect(passesNewCandidateFilter({ pac: 70 },pos,300000)).toBe(true);
 expect(passesNewCandidateFilter({ player_stats: [{pac:62}] },pos,300000)).toBe(false);
});
