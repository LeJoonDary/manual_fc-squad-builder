import { expect, test } from 'vitest';
import { generateOptimalSquad, getDynamicCandidatesForSlot, calculateMetaScore, calculateSquadChemistry } from './autoBuildUtils';
import { normalizeChemistryPosition } from './chemistry';
import { FORMATIONS } from './formations.js';
const make = (id: number, position: string, rating = 90, price = 1000, extra = {}) => ({
 id, player_id: id, position, price, overall:rating, pac:rating, sho:rating, pas:rating,
 dri:rating, def:rating, phy:rating, nationId:'n', leagueId:'l', clubId:'c', ...extra,
});
function lockedExcept(positions: string[], icons = false) {
 return Object.fromEntries(FORMATIONS.find(f=>f.name==='4-3-1-2')!.slots
  .filter(s=>!positions.includes(normalizeChemistryPosition(s.position)))
  .map((s,i)=>[s.position,{card:make(i,s.position,90,1000,icons?{isIcon:true,card_type:'ICON'}:{}),isLocked:true,isOwned:true}]));
}
test('selects the stronger 279k + 66k pair rather than a 482k ace and filler', async () => {
 const currentSquad=lockedExcept(['ST']);
 const paid=Object.values(currentSquad)[0]; paid.isOwned=false; paid.card.price=475000;
 const result = await generateOptimalSquad('4-3-1-2',{FW:[
  make(100,'ST',99,482000),make(101,'ST',96,279000),make(102,'ST',95,66000),make(103,'ST',85,40000),
 ],MF:[],DF:[]},1000000,33,false,{currentSquad});
 expect(result.success).toBe(true);
 expect(result.squad.filter(p=>!p.isLocked).map(p=>p.id).sort()).toEqual(['101','102']);
 expect(result.totalCost).toBe(820000);
 expect(result.totalCost-475000).toBeLessThanOrEqual(525000);
});
test('optimizes the combined score of a three-slot midfield within one group cap', async () => {
 const currentSquad=lockedExcept(['CM']);
 const paid=Object.values(currentSquad)[0]; paid.isOwned=false; paid.card.price=475000;
 const result = await generateOptimalSquad('4-3-1-2',{FW:[],MF:[
  make(100,'CM',99,400000),make(101,'CM',95,180000),make(102,'CM',94,170000),make(103,'CM',93,160000),make(104,'CM',80,10000),
 ],DF:[]},1000000,33,false,{currentSquad,keyPositions:['CM']});
 expect(result.success).toBe(true);
 expect(result.squad.filter(p=>!p.isLocked).map(p=>p.id).sort()).toEqual(['101','102','103']);
 expect(result.totalCost).toBe(985000);
});
test('unlimited Icon squad selects stronger fullback and keeper without rewarding club links', async () => {
 const result = await generateOptimalSquad('4-3-1-2',{FW:[],MF:[],DF:[
  make(100,'LB',85),make(101,'LB',90,100000,{nationId:'other',leagueId:'other',clubId:'other'}),
  make(200,'GK',81),make(201,'GK',85),make(202,'GK',90,100000,{nationId:'other',leagueId:'other',clubId:'other'}),
 ]},0,33,false,{currentSquad:lockedExcept(['LB','GK'],true)});
 expect(result.success).toBe(true);
 expect(result.squad.filter(p=>!p.isLocked).map(p=>p.id).sort()).toEqual(['101','202']);
 expect(result.totalChemistry).toBe(33);
});
test('completed candidate chemistry disables every affiliation bonus and core preference', () => {
 const prepared = (id:number,position:string,rating:number,extra={}) => {
  const card=make(id,position,rating,1000,extra);
  return {...card,id:String(id),card,playerKey:String(id),slotPosition:position,isOwned:false,isLocked:true,metaScore:calculateMetaScore(card,position)};
 };
 const squad = FORMATIONS.find(f=>f.name==='4-3-1-2')!.slots.filter(s=>s.position!=='GK')
  .map((s,i)=>prepared(i,s.position,90,{isIcon:true,card_type:'ICON'}));
 const weak={...prepared(100,'GK',85),isLocked:false};
 const strong={...prepared(101,'GK',90,{clubId:'x',leagueId:'x',nationId:'x'}),isLocked:false};
 expect(calculateSquadChemistry([...squad,strong],false).totalChemistry).toBe(33);
 const ranked=getDynamicCandidatesForSlot('GK',squad as any,[weak,strong] as any,Infinity,null,150,'l',false,33);
 expect(ranked[0].id).toBe('101');
});

test('returns to the next pair when the strongest combination cannot reach target chemistry', async () => {
 const result=await generateOptimalSquad('4-3-1-2',{FW:[
  make(100,'ST',99,1000,{nationId:'x',leagueId:'x',clubId:'x'}),
  make(101,'ST',96),make(102,'ST',95),
 ],MF:[],DF:[]},0,33,false,{currentSquad:lockedExcept(['ST'])});
 expect(result.success).toBe(true);
 expect(result.squad.filter(p=>!p.isLocked).map(p=>p.id).sort()).toEqual(['101','102']);
 expect(result.totalChemistry).toBe(33);
});

test('prioritizes the connected pair over isolated higher-meta pairs', async () => {
 const result=await generateOptimalSquad('4-3-1-2',{FW:[
  make(100,'ST',99,1000,{nationId:'x',leagueId:'x',clubId:'x'}),
  make(101,'ST',90),make(102,'ST',89),make(103,'ST',88),make(104,'ST',87),
 ],MF:[],DF:[]},0,33,false,{currentSquad:lockedExcept(['ST'])});
 expect(result.success).toBe(true);
 expect(result.searchStage).toBe(1);
 expect(result.stageAttempts[0]).toBe(1);
 expect(result.squad.filter(p=>!p.isLocked).map(p=>p.id).sort()).toEqual(['101','102']);
});
test('free search keeps group budget, exclusions and star requirements', async () => {
 const candidates=Array.from({length:6},(_,i)=>make(100+i,'ST',99-i/10,1000,{nationId:'x',leagueId:'x',clubId:'x',sm:4}));
 candidates.push(make(200,'ST',95,600000,{sm:4}),make(201,'ST',94,1000,{sm:3}),make(202,'ST',93,1000,{sm:4}));
 const result=await generateOptimalSquad('4-3-1-2',{FW:candidates,MF:[],DF:[]},1000000,33,false,{
  currentSquad:lockedExcept(['ST']), excludedCardVersionIds:[202],
  slotRequirements:Object.fromEntries(FORMATIONS.find(f=>f.name==='4-3-1-2')!.slots
    .filter(s=>normalizeChemistryPosition(s.position)==='ST').map(s=>[s.position,{minSm:4}])),
 });
 expect(result.success).toBe(false);
 expect(result.searchStage).toBe(4);
 expect(result.squad.filter(p=>!p.isLocked).every(p=>Number(p.id)<200)).toBe(true);
 expect(result.totalCost).toBeLessThanOrEqual(525000);
});
