import { expect, test } from 'vitest';
import { getRecommendedPlayersForSlot, getSlotRecommendationPriceCap, calculateSquadChemistry } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';
const positions = FORMATIONS.find(f=>f.name==='4-3-1-2')!.slots.map(s=>s.position);
const card = (id:number, position:string, extra={}) => ({id,player_id:id,position,overall:90,price:10000,
  pac:90,sho:90,pas:90,dri:90,def:90,phy:90, nationId:'A',leagueId:'A',clubId:'A',...extra});
const squad = () => Object.fromEntries(positions.map((pos,i)=>[pos,{card:card(i+1,pos,
  i>=9 ? {nationId:'B',leagueId:'B',clubId:'B'} : {}),isOwned:false,isLocked:false}]));
const opts = (extra={}) => ({formation:'4-3-1-2',slotPosition:'GK',totalBudget:0,mode:'replace' as const,considerManager:true,currentSquad:squad(),...extra});
const run = (cards:any[],extra={}) => getRecommendedPlayersForSlot(null as any,opts(extra),cards);
const keeper = (id:number,extra={}) => card(id,'GK',{nationId:'B',leagueId:'B',clubId:'B',...extra});
test('smart manager maintains 33 and sorts by pure meta descending', async()=>{
  const team=squad();
  const prepared=Object.entries(team).map(([position,entry])=>({...entry.card,id:String(entry.card.id),slotPosition:position}));
  expect(calculateSquadChemistry(prepared as any,false).totalChemistry).toBeLessThan(33);
  const result=await run([keeper(100,{overall:88}),keeper(101,{overall:95})]);
  expect(result).toHaveLength(2);
  expect(result.every(r=>r.beforeChem===33 && r.afterChem===33 && r.chemDelta===0 && r.bestManager)).toBe(true);
  expect(result[0].metaScore).toBeGreaterThan(result[1].metaScore);
});
test('refund excludes the old purchase, while owned card contributes no refund',()=>{
  const options=opts({totalBudget:150000});
  options.currentSquad.GK.card.price=40000;
  expect(getSlotRecommendationPriceCap(options)).toBe(50000);
  options.currentSquad.GK.isOwned=true;
  expect(getSlotRecommendationPriceCap(options)).toBe(50000);
  expect(getSlotRecommendationPriceCap({...options,slotMaxPrice:30000})).toBe(30000);
});
test('same player different version is eligible, exact card and other-slot player are not',async()=>{
  const old=squad().GK.card;
  const result=await run([old,keeper(100,{player_id:old.player_id}),keeper(101,{player_id:1})]);
  expect(result.map(r=>r.card.id)).toEqual([100]);
});
test('linked chemistry loss is only offered by all-meta tab, with finite scores',async()=>{
  const candidate=card(100,'GK',{overall:95});
  expect(await run([candidate])).toEqual([]);
  const result=await run([candidate],{sort:'meta_synergy'});
  expect(result).toHaveLength(1);
  expect(result[0].chemDelta).toBeLessThan(0);
  expect(Number.isFinite(result[0].metaScore)).toBe(true);
  expect(Number.isFinite(result[0].score)).toBe(true);
});
test('replacement price filtering occurs in DB before LIMIT',async()=>{
  const calls:any[]=[];const query:any={};
  for(const method of ['select','eq','gte','lte','gt','not','order']) query[method]=(...args:any[])=>{calls.push([method,...args]);return query;};
  query.range=async()=>({data:[],error:null});
  await getRecommendedPlayersForSlot({from:()=>query} as any,opts({totalBudget:150000,slotMaxPrice:30000}));
  expect(calls).not.toContainEqual(['lte','price',30000]);expect(calls).toContainEqual(['gte','overall',80]);
});

test.each(['LB','RB'])('replacement honors cheap 83 OVR %s cards and the explicit fullback cap', async position=>{
  const affiliation = squad()[position].card;
  const result = await run([card(100,position,{...affiliation,id:100,player_id:100,overall:83,price:30000}),
    card(101,position,{...affiliation,id:101,player_id:101,price:30001})], {
    slotPosition:position,slotMaxPrice:30000,
  });
  expect(result.map(row=>row.card.id)).toEqual([100]);
});

test('replacement toggle admits acquisition cards by default and excludes them when off', async () => {
  const candidate = keeper(100, { card_type: 'SPECIAL_SBC', sbc_price: 1000, price: 999999 });
  const settings = { sort: 'meta_synergy', slotMaxPrice: 1000 };
  expect((await run([candidate], settings)).map(row => row.card.id)).toEqual([100]);
  expect(await run([candidate], { ...settings, slotMaxPrice: 0 })).toHaveLength(1);
  expect(await run([candidate], { ...settings, includeAcquisitionCards: false })).toEqual([]);
});
