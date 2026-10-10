import { expect, test } from 'vitest';
import { passesNewCandidateFilter, generateOptimalSquad } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';

test.each(['PoTm Bundesliga', 'special_SBC', 'SBC', 'special_potm'])('rejects untradeable %s in either identity field and wrapped cards', value => {
 for (const field of ['version', 'card_type']) {
  const card = { price: 20000, facePace: 90, [field]: value };
  for (const candidate of [card, { card }, { raw: card }, { version: 'Gold', raw: card }]) {
   expect(passesNewCandidateFilter(candidate, 'CAM', 100000)).toBe(false);
   expect(passesNewCandidateFilter(candidate, 'CAM', 500000)).toBe(false);
  }
 }
 expect(passesNewCandidateFilter({ price: 20000, facePace: 79, version: 'special_totw' }, 'CAM', 500000)).toBe(true);
});
test.each(['LB','RB','LWB','RWB'])('15 percent cap for %s is lifted only by FB priority', pos=>{
 expect(passesNewCandidateFilter({price:150000},pos,1000000,['ST'])).toBe(true);
 expect(passesNewCandidateFilter({price:150001},pos,1000000,['ST'])).toBe(false);
 expect(passesNewCandidateFilter({price:300000},pos,1000000,['FB'])).toBe(true);
 expect(passesNewCandidateFilter({price:300000},pos,1000000,['ST'])).toBe(false);
 expect(passesNewCandidateFilter({price:300000},pos,499999,['ST'])).toBe(false);
});
test('keeper cap and striker pace have inclusive boundaries and normalized aliases',()=>{
 expect(passesNewCandidateFilter({price:100000},'GK',1000000,['ST'])).toBe(true);
 expect(passesNewCandidateFilter({price:100001},'GK',1000000,['ST'])).toBe(false);
 expect(passesNewCandidateFilter({price:300000},'GK',1000000,['GK'])).toBe(true);
 for(const pos of ['ST','CF','LS','RS']) {
 expect(passesNewCandidateFilter({facePace:84},pos,500000)).toBe(false);
 expect(passesNewCandidateFilter({attributeSprintSpeed:85},pos,500000)).toBe(true);
 expect(passesNewCandidateFilter({player_stats:[{pac:84}]},pos,500000)).toBe(false);
 expect(passesNewCandidateFilter({facePace:75},pos,499999)).toBe(true);
 }
 expect(passesNewCandidateFilter({facePace:84},'LW',100000)).toBe(true);
});
test.each([['LB','FB'],['GK','GK']])('beam and upgrade obey %s cap and its priority override',async (pos,group)=>{
 const slots=FORMATIONS.find(f=>f.name==='4-3-3')!.slots;
 const make=(id,position,overall,price)=>({id,player_id:id,position,overall,price,facePace:90,def:80,leagueId:100,nationId:1,clubId:1});
 const currentSquad=Object.fromEntries(slots.filter(s=>s.position!==pos).map((s,i)=>[s.position,{card:{...make(i,s.position,90,1000),isIcon:true},isLocked:true,isOwned:true}]));
 const groups={FW:[],MF:[],DF:[make(100,pos,82,40000),make(101,pos,95,200000)]};
 const capped=await generateOptimalSquad('4-3-3',groups,1000000,33,false,{currentSquad});
 expect(capped.success).toBe(true);
 expect(capped.squad.find(p=>p.slotPosition===pos)?.id).toBe('100');
 const priority=await generateOptimalSquad('4-3-3',groups,1000000,33,false,{currentSquad,keyPositions:[group]});
 expect(priority.success).toBe(true);
 expect(priority.squad.find(p=>p.slotPosition===pos)?.id).toBe('101');
 expect(priority.squad.filter(p=>p.isLocked)).toHaveLength(10);
});
