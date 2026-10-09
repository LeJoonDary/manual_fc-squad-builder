import { expect, test } from 'vitest';
import { isCardIcon, isCardHero } from './specialCardIdentity.js';
import { adaptChemistryPlayerCard, calculateChemistry } from './chemistry';
import { isStrictSelectionValid, isActiveLeagueCandidate, generateOptimalSquad, getPositionBudgetGroup, AUTO_BUILD_CANDIDATE_SELECT, calculateFinalSquadScore } from './autoBuildUtils';
import { PLAYER_LIST_SELECT } from './playerCatalog.js';
import { FORMATIONS } from './formations.js';

test.each([{ isIcon: true }, { league_id: 2118 }, { league_id: '2118' }, { club_id: '112658' },
 { version: 'Prime ICON' }, { card_type: 'Special_Icon' }, { raw: { league_id: 2118 } }, { leagueId: 'league:id:2118' }])('recognizes icon identity %j despite absent flags', card => {
 expect(isCardIcon(card)).toBe(true);
 expect(adaptChemistryPlayerCard(card).isIcon).toBe(true);
});

test('raw-type Icons do not consume real league/club quotas; third new Icon remains eligible', () => {
 const icons = Array.from({ length: 6 }, (_, i) => ({ version: 'ICON', leagueId: 2118, clubId: 112658, nationId: i, isLocked: i < 4 }));
 expect(isStrictSelectionValid(icons)).toBe(true);
 expect(isStrictSelectionValid([...icons, { version: 'ICON', nationId: 99 }])).toBe(true);
 expect(isActiveLeagueCandidate({ leagueId: 102 } as any, [{ leagueId: 100 }, { leagueId: 101 }, { leagueId: 2118 }] as any)).toBe(true);
 expect(isCardHero({ version: 'Base Hero' })).toBe(true);
});

test('Icon and Hero contribute real chemistry and do not invent an Icon league', () => {
 const rows = [
  { id: 'icon', league_id: 2118, club_id: 112658, nation_id: 1 },
  { id: 'hero', version: 'Hero', league_id: 100, nation_id: 2 },
  { id: 'a', league_id: 100, club_id: 10, nation_id: 1 },
  { id: 'b', league_id: 101, club_id: 11, nation_id: 2 },
 ].map(c => adaptChemistryPlayerCard({ ...c, position: 'ST' }));
 const result = calculateChemistry(rows.map(player => ({ position: 'ST', player })));
 expect(result.playerChemMap.icon).toBe(3);
 expect(result.playerChemMap.hero).toBe(3);
 expect(result.groupCounts.league).toEqual({ 'league:id:100': 4, 'league:id:101': 2 });
 expect(result.groupCounts.nation).toEqual({ 'nation:id:1': 3, 'nation:id:2': 2 });
 const misplaced = calculateChemistry([{ position: 'GK', player: rows[0] }, { position: 'ST', player: rows[2] }]);
 expect(misplaced.playerChemMap.icon).toBe(0);
 expect(misplaced.groupCounts.league).toEqual({ 'league:id:100': 1 });
});

const slots = FORMATIONS.find(f => f.name === '4-3-3')!.slots;
const make = (id, position, icon = false) => ({ id, player_id: id, position, nationId: id % 3, leagueId: icon ? 2118 : 100,
 clubId: icon ? 112658 : 5, overall: icon ? 95 : 85, facePace: 90, def: 80, price: 20000, version: icon ? 'ICON' : 'Gold' });

test('locked Icons bypass both automatic Icon cap and user special-card limit', async () => {
 const currentSquad = Object.fromEntries(slots.map((s,i) => [s.position, { card: make(i,s.position,true), isLocked: true, isOwned: true }]));
 const result = await generateOptimalSquad('4-3-3', { FW: [], MF: [], DF: [] }, 0, 33, false, { currentSquad, maxSpecialCards: 0 });
 expect(result.success).toBe(true);
 expect(result.squad).toHaveLength(11);
 expect(result.totalChemistry).toBe(33);
});

test('beam can select three new Icons when no lower-scoring alternatives are provided', async () => {
 const currentSquad = Object.fromEntries(slots.filter(s => !['LW','ST','RW'].includes(s.position)).map((s,i) => [s.position, { card: make(i,s.position,true), isLocked: true, isOwned: true }]));
 const groups = { FW: [], MF: [], DF: [] } as Record<string, any[]>;
 ['LW','ST','RW'].forEach((pos,i) => groups[getPositionBudgetGroup(pos,false)].push(make(100+i,pos,true)));
 const result = await generateOptimalSquad('4-3-3', groups, 1000000, 33, false, { currentSquad });
 expect(result.success).toBe(true);
 expect(result.squad.filter(p=>!p.isLocked && p.isIcon).length).toBe(3);
 expect(result.squad.filter(p=>p.isLocked)).toHaveLength(8);
});

test('target is honored by score and success, including lower explicit targets', async () => {
 const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'ST').map((s,i) => [s.position, { card: { ...make(i,s.position), nationId: 1 }, isLocked: true, isOwned: true }]));
 const groups = { FW: [{ ...make(100,'ST'), nationId: 9, leagueId: 101, clubId: 9 }], MF: [], DF: [] };
 const denied = await generateOptimalSquad('4-3-3',groups,1000000,33,false,{currentSquad});
 expect(denied.success).toBe(false);
 expect(denied.status).toBe('chemistry_unmet');
 expect(denied.finalScore).toBe(-20000 + denied.totalChemistry * 100);
 const accepted = await generateOptimalSquad('4-3-3',groups,1000000,30,false,{currentSquad});
 expect(accepted.success).toBe(true);
 expect(accepted.minChemistryTarget).toBe(30);
 expect(calculateFinalSquadScore(denied.squad,32,1000000)).toBe(-16800);
});

test('list and auto-build queries fetch actual GK stats, not just field face stats', () => {
 for (const select of [PLAYER_LIST_SELECT, AUTO_BUILD_CANDIDATE_SELECT])
  for (const field of ['gk_diving','gk_handling','gk_kicking','gk_reflexes','gk_positioning','sprint_speed']) expect(select).toContain(field);
});


test('legacy focus inputs produce identical selections and a zero-price card never enters an open slot', async () => {
 const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'ST').map((s,i) => [s.position, { card: make(i,s.position,true), isLocked: true, isOwned: true }]));
 const groups = { FW: [{ ...make(100,'ST'), price: 0, overall: 99 }, make(101,'ST')], MF: [], DF: [] };
 const results = [];
 for (const focus of ['attack','balanced','defense'] as const) results.push(await generateOptimalSquad('4-3-3',groups,1000000,33,false,{ currentSquad, focus, excludeZeroPriceCards: false }));
 for (const result of results) {
   expect(result.success).toBe(true);
   expect(result.squad.find(p=>p.slotPosition==='ST')?.id).toBe('101');
   expect(result.squad.map(p=>p.id)).toEqual(results[0].squad.map(p=>p.id));
 }
});
