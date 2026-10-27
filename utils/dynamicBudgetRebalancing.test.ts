import { expect, test } from 'vitest';
import { calculateDynamicSlotCap, generateOptimalSquad, getRemainingAutoBuildBudget, fetchCandidatePlayers, fitsAnchorBudgetCaps } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';
import { normalizeChemistryPosition } from './chemistry';
const slots=FORMATIONS.find(f=>f.name==='4-3-1-2')!.slots;
const make=(id:number,position:string,price=1000,overall=90)=>({id,player_id:id,position,price,overall,pac:90,sho:90,pas:90,dri:90,def:90,phy:90,nationId:'n',leagueId:'l',clubId:'c'});
function lockedExcept(open:string[]) {
 return Object.fromEntries(slots.filter(s=>!open.includes(s.position)).map((s,i)=>[s.position,{card:make(i,s.position),isLocked:true,isOwned:true}]));
}
test('per-card ratios use total budget and retain the remaining-balance constraint',()=>{
 const priorities=['ST','CAM','CM','CB','FB','GK'];
 const pending=['LS','RS','LCM','CM','RCM','LCB','RCB','LB','RB','GK'];
 const cap=calculateDynamicSlotCap('LS',pending,200000);
 expect(cap).toBe(70000);
 expect(cap).toBeGreaterThan(0);
 expect(calculateDynamicSlotCap('GK',['GK'],170000)).toBe(17680);
 expect(calculateDynamicSlotCap('GK',['GK'],0)).toBe(0);
 expect(calculateDynamicSlotCap('GK',['GK'],0,true)).toBe(Infinity);
});
test('279k locked striker does not consume the remaining striker group cap twice',async()=>{
 const st=slots.filter(s=>normalizeChemistryPosition(s.position)==='ST');
 const currentSquad=lockedExcept([st[1].position]);
 currentSquad[st[0].position].isOwned=false;
 currentSquad[st[0].position].card.price=279000;
 const before=structuredClone(currentSquad);
 const result=await generateOptimalSquad('4-3-1-2',{FW:[make(100,'ST',87500)],MF:[],DF:[]},500000,33,false,{currentSquad});
 expect(result.success).toBe(true);
 expect(result.totalCost).toBe(366500);
 expect(fitsAnchorBudgetCaps(result.squad,500000)).toBe(true);
 expect(currentSquad).toEqual(before);
});
test('300k paid CAM leaves exactly 200k for the ten unfilled slots',async()=>{
 const currentSquad={CAM:{card:make(999,'CAM',300000),isLocked:true,isOwned:false}};
 const cards=slots.filter(s=>s.position!=='CAM').map((s,i)=>({...make(100+i,normalizeChemistryPosition(s.position),10000),isIcon:true,card_type:'ICON',nationId:'icon-'+i}));
 const result=await generateOptimalSquad('4-3-1-2',{FW:cards,MF:cards,DF:cards},500000,33,false,{currentSquad});
 expect(getRemainingAutoBuildBudget(500000,'4-3-1-2',{currentSquad}).remainingTotalBudget).toBe(200000);
 expect(result.success).toBe(true);
 expect(result.totalCost).toBe(400000);
});
test('over-budget locks fail before any candidate query with explicit costs',async()=>{
 let queries=0;
 const options={currentSquad:{CAM:{card:make(999,'CAM',600000),isLocked:true}}};
 await expect(fetchCandidatePlayers(500000,'4-3-1-2',false,{from:()=>{queries++;}} as any,options))
  .rejects.toThrow('Locked players cost (600,000 C) exceeds target budget (500,000 C). Please increase budget or unlock cards.');
 expect(queries).toBe(0);
 await expect(generateOptimalSquad('4-3-1-2',{FW:[],MF:[],DF:[]},500000,33,false,options)).rejects.toThrow('600,000 C');
});
test('a final goalkeeper uses savings from locked slots',async()=>{
 const currentSquad=lockedExcept(['GK']);
 const paid=Object.values(currentSquad)[0];paid.isOwned=false;paid.card.price=300000;
 const result=await generateOptimalSquad('4-3-1-2',{FW:[],MF:[],DF:[make(100,'GK',130000),make(101,'GK',150000,99)]},500000,33,false,{currentSquad});
 expect(result.success).toBe(true);
 expect(result.totalCost).toBe(430000);
});

test('zero remaining budget cannot buy new cards, while owned locks keep their zero purchase cost',async()=>{
 const currentSquad=lockedExcept(['GK']);
 const paid=Object.values(currentSquad)[0];paid.isOwned=false;paid.card.price=500000;
 const result=await generateOptimalSquad('4-3-1-2',{FW:[],MF:[],DF:[make(100,'GK',1000)]},500000,33,false,{currentSquad});
 expect(result.success).toBe(false);
 expect(result.totalCost).toBe(500000);
 paid.isOwned=true;
 expect(getRemainingAutoBuildBudget(500000,'4-3-1-2',{currentSquad}).remainingTotalBudget).toBe(500000);
});
