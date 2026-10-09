import { expect, test } from 'vitest';
import { buildDynamicFillOrder, generateOptimalSquad } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';
test('priorities group canonical slots, deduplicate choices and preserve input',()=>{
 const slots=['GK','LCB','ST','RCB','LCM','RB','LB','CAM'].map(position=>({position}));
 expect(buildDynamicFillOrder(slots,['CB','CAM','CB','UNKNOWN']).map(s=>s.position)).toEqual(['LCB','RCB','CAM','ST','LCM','RB','LB','GK']);
 expect(slots[0].position).toBe('GK');
});
const slots=FORMATIONS.find(f=>f.name==='4-3-3')!.slots;
const card=(id,position,overall=90,price=1000)=>({id,player_id:id,position,overall,price,facePace:99,def:80,nationId:1,leagueId:100,clubId:1});
test('higher OVR but worse meta cards do not replace stronger incumbents',async()=>{
 const locked=Object.fromEntries(slots.filter(s=>!['LW','ST','RW'].includes(s.position)).map((s,i)=>[s.position,{card:{...card(i,s.position),isIcon:true},isLocked:true,isOwned:true}]));
 const rows=['LW','ST','RW'].flatMap((pos,i)=>[card(100+i,pos,82,1000),{...card(200+i,pos,85,20000),facePace:70}]);
 const result=await generateOptimalSquad('4-3-3',{FW:rows,MF:[],DF:[]},100000,33,false,{currentSquad:locked,keyPositions:['ST']});
 expect(result.success).toBe(true);
 expect(result.totalChemistry).toBe(33);
 expect(result.squad.filter(p=>!p.isLocked && p.card.overall>=85)).toHaveLength(0);
 expect(result.totalCost).toBe(3000);
 expect(result.squad.filter(p=>p.isLocked)).toHaveLength(8);
 expect(result.squad.find(p=>p.slotPosition==='ST')?.metaScore).toBeGreaterThan(170);
});
test('upgrade cannot exceed budget or replace locked low-tier cards',async()=>{
 const locked=Object.fromEntries(slots.filter(s=>s.position!=='ST').map((s,i)=>[s.position,{card:{...card(i,s.position,82),isIcon:true},isLocked:true,isOwned:true}]));
 const result=await generateOptimalSquad('4-3-3',{FW:[card(100,'ST',82,1000),{...card(200,'ST',85,20000),facePace:70}],MF:[],DF:[]},9000,33,false,{currentSquad:locked});
 expect(result.success).toBe(true);
 expect(result.totalCost).toBe(1000);
 expect(result.squad.every(p=>p.card.overall===82)).toBe(true);
});

test('post-pass replaces a higher OVR incumbent only when in-game meta improves', async()=>{
 const locked=Object.fromEntries(slots.filter(s=>s.position!=='ST').map((s,i)=>[s.position,{card:{...card(i,s.position),isIcon:i!==0},isLocked:true,isOwned:true}]));
 const incumbent={...card(100,'ST',90,1000),finishing:60,composure:60};
 const upgrade={...card(200,'ST',85,20000),clubId:9,finishing:99,composure:99};
 const result=await generateOptimalSquad('4-3-3',{FW:[incumbent,upgrade],MF:[],DF:[]},100000,33,false,{currentSquad:locked});
 expect(result.success).toBe(true);
 expect(result.squad.find(p=>p.slotPosition==='ST')?.id).toBe('200');
 expect(result.totalChemistry).toBe(33);
 expect(result.totalCost).toBe(20000);
});
