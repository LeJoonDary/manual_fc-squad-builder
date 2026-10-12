import { expect, test } from 'vitest';
import { generateOptimalSquad, matchesSlotRequirements, passesNewCandidateFilter, fetchCandidatePlayers } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';

const base = { overall: 90, pac: 90, sho: 90, pas: 90, dri: 90, def: 90, phy: 90,
 price: 1000, nationId: 'n', leagueId: 'l', clubId: 'c', gender: 'Male', sm: 4, wf: 4 };
const card = (id: number, position: string, extra = {}) => ({ ...base, id, player_id: id, position, ...extra });
test.each([undefined, 0, 100000, 299999, 300000, 500000, 60000000])('forces all pace/defense floors at budget %s', budget => {
 for (const [pos, pace] of [['CB',70],['LCB',70],['CM',70],['CDM',70],['ST',82],['CF',82],['LB',82],['RB',82],['LWB',82],['RWB',82],['CAM',79]] as const) {
  expect(passesNewCandidateFilter(card(1,pos,{pac:pace-1}),pos,budget as number)).toBe(false);
  expect(passesNewCandidateFilter(card(1,pos,{pac:pace}),pos,budget as number)).toBe(true);
 }
 for (const [pos, def] of [['CB',80],['CM',70],['CDM',70]] as const) {
  expect(passesNewCandidateFilter(card(1,pos,{def:def-1}),pos,budget as number)).toBe(false);
  expect(passesNewCandidateFilter(card(1,pos,{def}),pos,budget as number)).toBe(true);
 }
 expect(passesNewCandidateFilter(card(1,'CB',{pac:62}), 'CB', budget as number)).toBe(false);
 expect(passesNewCandidateFilter(card(1,'ST',{pac:62}), 'ST', budget as number)).toBe(false);
});
test('unlimited uses high-budget physicality floors while a small finite budget keeps its floor', () => {
 for (const budget of [0, undefined]) {
  expect(passesNewCandidateFilter(card(1,'ST',{phy:69}), 'ST', budget as number)).toBe(false);
  expect(passesNewCandidateFilter(card(1,'LB',{phy:64}), 'LB', budget as number)).toBe(false);
 }
 expect(passesNewCandidateFilter(card(1,'ST',{phy:66}), 'ST', 100000)).toBe(true);
 expect(passesNewCandidateFilter(card(1,'LB',{phy:64}), 'LB', 100000)).toBe(true);
});
test.each([150,200,250])('filters more than %i excluded and insufficient-star cards before taking the candidate pool', async count => {
 const slots = FORMATIONS.find(f => f.name === '4-3-3')!.slots;
 const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'ST').map((s,i) =>
  [s.position,{card:card(i,s.position),isLocked:true,isOwned:true}]));
 const excluded = Array.from({length:count},(_,i) => card(1000+i,'ST',{overall:99}));
 const lowSm = Array.from({length:count},(_,i) => card(2000+i,'ST',{overall:98,sm:3}));
 const lowWf = Array.from({length:count},(_,i) => card(3000+i,'ST',{overall:97,wf:3}));
 const valid = card(9999,'ST');
 const result = await generateOptimalSquad('4-3-3',{FW:[...excluded,...lowSm,...lowWf,valid],MF:[],DF:[]},0,33,false,{
  currentSquad, excludedCardVersionIds:excluded.map(p=>String(p.id)),
  slotRequirements:{ST:{minSkillMoves:4,minWeakFoot:4}},
 });
 expect(result.success).toBe(true);
 expect(result.searchStage).toBe(1);
 expect(result.squad.find(p=>p.slotPosition==='ST')?.id).toBe('9999');
});
test('advanced requirements accept raw and wrapped star aliases', () => {
 expect(matchesSlotRequirements({card:{skill_moves:4,weak_foot:5}},{minSm:4,minWf:5})).toBe(true);
 expect(matchesSlotRequirements({raw:{sm:3,wf:5}},{minSkillMoves:4,minWeakFoot:5})).toBe(false);
 expect(matchesSlotRequirements({sm:5,wf:3},{minSm:4,minWf:4})).toBe(false);
});
test('database star and exclusion filters are issued before the 250-card limit', async () => {
 const calls: Array<[string,...any[]]> = [];
 const query: any = {};
 for (const method of ['select','in','gte','lte','gt','not','order','or','eq']) {
  query[method] = (...args: any[]) => { calls.push([method,...args]); return query; };
 }
 query.limit = async (n: number) => { calls.push(['limit',n]); return {data:[],error:null}; };
 const slots = FORMATIONS.find(f=>f.name==='4-3-3')!.slots;
 const currentSquad = Object.fromEntries(slots.filter(s=>s.position!=='ST').map((s,i)=>[s.position,{card:card(i,s.position),isLocked:true,isOwned:true}]));
 await fetchCandidatePlayers(0,'4-3-3',false,{from:()=>query} as any,{
  currentSquad,excludedCardVersionIds:['999'],slotRequirements:{ST:{minSkillMoves:4,minWeakFoot:5}},
 });
 const limitIndex = calls.findIndex(c=>c[0]==='limit');
 expect(calls[limitIndex]).toEqual(['limit',250]);
 expect(calls.slice(0,limitIndex)).toContainEqual(['gte','sm',4]);
 expect(calls.slice(0,limitIndex)).toContainEqual(['gte','wf',5]);
 expect(calls.slice(0,limitIndex)).toContainEqual(['not','id','in','(999)']);
});
