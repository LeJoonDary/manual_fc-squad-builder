import { expect, test, vi } from 'vitest';
import { calculateMetaScore, generateOptimalSquad, passesNewCandidateFilter } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';

const base = { overall: 90, pac: 90, sho: 90, pas: 90, dri: 90, def: 90, phy: 90,
 price: 1000, nationId: 'n', leagueId: 'l', clubId: 'c', gender: 'Male' };
const card = (id: number, position: string, extra = {}) => ({ ...base, id, player_id: id, position, ...extra });
function fixture() {
 const slots = FORMATIONS.find(f => f.name === '4-3-1-2')!.slots;
 const open = slots.find(s => ['ST','LS','LST'].includes(s.position))!.position;
 const currentSquad = Object.fromEntries(slots.filter(s => ![open, 'GK'].includes(s.position)).map((s,i) =>
  [s.position, { card: card(i, s.position), isLocked: true, isOwned: true }]));
 return { open, currentSquad };
}
test.each([151, 201, 251, 300])('expands the wingless search to reach candidate %i without changing the anchor', async rank => {
 const { open, currentSquad } = fixture();
 const keepers = Array.from({ length: rank - 1 }, (_, i) => card(1000+i, 'GK', { nationId: 'x', leagueId: 'y', clubId: 'z' }));
 keepers.push(card(5000, 'GK', { overall: 85 }));
 const result = await generateOptimalSquad('4-3-1-2', { FW: [card(100, 'ST')], MF: [], DF: keepers }, 0, 33, false, { currentSquad });
 expect(result.success).toBe(true);
 expect(result.totalChemistry).toBe(33);
 expect(result.searchStage).toBe(rank === 151 ? 2 : 3);
 expect(result.stageAttempts.slice(0, result.searchStage).every(n => n > 0)).toBe(true);
 expect(result.iterations).toBeLessThanOrEqual(50000);
 expect(result.squad.find(p => p.slotPosition === open)?.id).toBe('100');
 expect(result.squad.find(p => p.slotPosition === 'GK')?.id).toBe('5000');
});
test('rejects chemistry below the target and preserves input', async () => {
 const { currentSquad } = fixture();
 Object.values(currentSquad).slice(0, 5).forEach(entry => { entry.card.leagueId = 'other'; });
 const before = structuredClone(currentSquad);
 const result = await generateOptimalSquad('4-3-1-2', { FW: [card(100, 'ST')], MF: [], DF: [card(200, 'GK', { nationId: 'x', leagueId: 'l', clubId: 'z' })] }, 0, 33, false, { currentSquad });
 expect(result.success).toBe(false);
 expect(result.status).toBe('chemistry_unmet');
 expect(result.totalChemistry).toBe(32);
 expect(result.searchStage).toBe(4);
 expect(currentSquad).toEqual(before);
});
test('CB cuts and primary-only bonus cover raw database cards and secondary CBs', () => {
 expect(passesNewCandidateFilter(card(1, 'LB', { def: 75 }), 'CB', 500000)).toBe(false);
 expect(passesNewCandidateFilter(card(1, 'CB', { def: 79 }), 'CB', 0)).toBe(false);
 expect(passesNewCandidateFilter(card(1, 'CB', { def: 80 }), 'CB', 0)).toBe(true);
 expect(calculateMetaScore(card(1, 'CB'), 'LCB') - calculateMetaScore(card(2, 'LB'), 'LCB')).toBe(10);
 expect(calculateMetaScore({ ...base, card_positions: [{ is_primary: true, positions: { name: 'CB' } }] }, 'CB')).toBe(100);
});

test('backtracks to the next anchor when the highest-ranked ace cannot solve chemistry', async () => {
 const { currentSquad } = fixture();
 const result = await generateOptimalSquad('4-3-1-2', {
  FW: [card(100, 'ST', { overall: 99, nationId: 'x', leagueId: 'y', clubId: 'z' }), card(101, 'ST')],
  MF: [], DF: [card(200, 'GK')],
 }, 0, 33, false, { currentSquad });
 expect(result.success).toBe(true);
 expect(result.totalChemistry).toBe(33);
 expect(result.squad.some(p => p.id === '101')).toBe(true);
 expect(result.squad.some(p => p.id === '100')).toBe(false);
});
test('all stages share a five-second deadline', async () => {
 const { currentSquad } = fixture();
 let now = -100;
 const clock = vi.spyOn(performance, 'now').mockImplementation(() => now += 100);
 try {
  const result = await generateOptimalSquad('4-3-1-2', {
   FW: [card(100, 'ST')], MF: [],
   DF: Array.from({ length: 250 }, (_, i) => card(1000+i, 'GK', { nationId: 'x', leagueId: 'y', clubId: 'z' })),
  }, 0, 33, false, { currentSquad });
  expect(result.success).toBe(false);
  expect(result.searchStage).toBe(4);
  expect(result.searchLimitReached).toBe(true);
  // The synthetic clock advances 100ms on each observation, including unwinding.
  expect(now).toBeLessThanOrEqual(5100);
 } finally { clock.mockRestore(); }
});
test.each([499999, 500000])('preserves midfield, striker and fullback stat floors at %i', budget => {
 for (const pos of ['CM','CDM']) {
  expect(passesNewCandidateFilter(card(1, pos, { def: 69 }), pos, budget)).toBe(false);
  expect(passesNewCandidateFilter(card(1, pos, { def: 70 }), pos, budget)).toBe(true);
 }
 for (const pos of ['ST','CF','LB','RB','LWB','RWB']) {
  expect(passesNewCandidateFilter(card(1, pos, { pac: 81 }), pos, budget)).toBe(false);
  expect(passesNewCandidateFilter(card(1, pos, { pac: 82 }), pos, budget)).toBe(true);
 }
 for (const pos of ['ST','CF']) {
  const floor = budget >= 500000 ? 70 : 66;
  expect(passesNewCandidateFilter(card(1, pos, { phy: floor-1 }), pos, budget)).toBe(false);
  expect(passesNewCandidateFilter(card(1, pos, { phy: floor }), pos, budget)).toBe(true);
 }
 expect(passesNewCandidateFilter(card(1, 'LB', { phy: 64 }), 'LB', budget)).toBe(budget < 500000);
 expect(passesNewCandidateFilter(card(1, 'LB', { phy: 65 }), 'LB', budget)).toBe(true);
});

test.each([['ST','FW',2],['CM','MF',3],['CB','DF',2]] as const)('%s repeated slots can select the top duo or trio from the same pool', async (position, group, count) => {
 const { normalizeChemistryPosition } = await import('./chemistry');
 const slots = FORMATIONS.find(f => f.name === '4-3-1-2')!.slots;
 const currentSquad = Object.fromEntries(slots.filter(s => normalizeChemistryPosition(s.position) !== position)
  .map((s,i) => [s.position,{card:card(i,s.position),isLocked:true,isOwned:true}]));
 const candidates = Array.from({length:12},(_,i) => card(100+i,position,{overall:99-i}));
 const result = await generateOptimalSquad('4-3-1-2',{FW:[],MF:[],DF:[],[group]:candidates},0,33,false,{currentSquad});
 expect(result.success).toBe(true);
 expect(result.squad.filter(p=>!p.isLocked).map(p=>p.id).sort()).toEqual(candidates.slice(0,count).map(p=>String(p.id)).sort());
 expect(new Set(result.squad.map(p=>p.playerKey)).size).toBe(11);
});
test('free backtracking can reach an ace beyond the top five sets', async () => {
 const { currentSquad } = fixture();
 const isolated = Array.from({length:10},(_,i)=>card(100+i,'ST',{overall:99-i/10,nationId:'x',leagueId:'y',clubId:'z'}));
 const result = await generateOptimalSquad('4-3-1-2',{FW:[...isolated,card(500,'ST')],MF:[],DF:[card(600,'GK')]},0,33,false,{currentSquad});
 expect(result.success).toBe(true);
 expect(result.searchStage).toBe(4);
 expect(result.squad.some(p=>p.id==='500')).toBe(true);
 expect(result.stageAttempts.every(n=>n>=5)).toBe(true);
});
test.each([0,4999999,5000000,60000000])('OVR floor at budget %i applies to every position including GK', budget => {
 expect(passesNewCandidateFilter(card(1,'CB',{overall:84}),'CB',budget)).toBe(budget===4999999);
 expect(passesNewCandidateFilter(card(1,'CB',{overall:85}),'CB',budget)).toBe(true);
 expect(passesNewCandidateFilter(card(1,'GK',{overall:83}),'GK',budget)).toBe(budget===4999999);
});
test('Icon CB receives no extra scoring bonus beyond the primary CB bonus', () => {
 expect(calculateMetaScore(card(1,'CB',{isIcon:true,card_type:'ICON'}),'CB')).toBe(calculateMetaScore(card(2,'CB'),'CB'));
});
