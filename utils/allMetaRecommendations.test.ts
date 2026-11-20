import { expect, test } from 'vitest';
import { getRecommendedPlayersForSlot as recommend, pureMetaScore } from './autoBuildUtils';
const card=(id,extra={})=>({id,player_id:id,position:'CM',overall:90,price:1000,pac:90,pas:90,dri:90,def:90,phy:90,sho:90,
  nationId:'A',leagueId:'L1',clubId:'C1',leagues:{name:'League 1'},...extra});
const opts=(extra={})=>({formation:'4-3-3',slotPosition:'CM',totalBudget:0,mode:'empty' as const,sort:'all_meta' as const,currentSquad:{},...extra});
const locked={LB:{card:card(1,{position:'LB'}),isLocked:true}};
test('empty pitch defaults to global meta and ranks actual performance above OVR',async()=>{
  const candidates=[card(2,{overall:99,pas:73,dri:76,def:73,pac:73}),card(3,{overall:85,leagueId:'L2',nationId:'B',clubId:'C2'}),card(4,{def:71})];
  const rows=await recommend(null,opts({sort:undefined}),candidates);
  expect(rows.map(row=>row.card.id)).toEqual([3,2]);
  expect(rows[0].metaScore).toBe(pureMetaScore(candidates[1],'CM'));
});
test('one locked player restricts synergy but all-meta includes unrelated leagues',async()=>{
  const candidates=[card(2),card(3,{leagueId:'L2',nationId:'B',clubId:'C2'}),card(4,{leagueId:'L3',nationId:'C',clubId:'C3'})];
  expect((await recommend(null,opts({currentSquad:locked,sort:'meta_synergy'}),candidates)).map(row=>row.card.id)).toEqual([2]);
  expect(await recommend(null,opts({currentSquad:locked}),candidates)).toHaveLength(3);
});
test('price cap allows low OVR, blocks expensive and invalid cards, returns finite scores',async()=>{
  const rows=await recommend(null,opts({slotMaxPrice:10000}),[card(2,{overall:83,price:10000}),card(3,{price:10001}),card(4,{price:0}),card(5,{def:71})]);
  expect(rows.map(row=>row.card.id)).toEqual([2]);expect(Number.isFinite(rows[0].metaScore)).toBe(true);
});
test('all-meta still applies DB cap and lowered OVR before limiting candidates',async()=>{
  const calls=[];const query:any={};for(const key of ['select','eq','gte','lte','gt','not','order'])query[key]=(...args)=>{calls.push([key,...args]);return query;};
  query.limit=async()=>({data:[],error:null});
  await recommend({from:()=>query} as any,opts({slotMaxPrice:30000}));
  expect(calls).toContainEqual(['lte','price',30000]);expect(calls).toContainEqual(['gte','overall',80]);
});
test('unlinked new league at dynamic capacity remains visible with warning',async()=>{
  const currentSquad=Object.fromEntries(['LB','RB','GK'].map((position,i)=>[position,{card:card(i+1,{position,leagueId:`L${i}`,clubId:`C${i}`}),isLocked:true}]));
  const rows=await recommend(null,opts({currentSquad}),[card(20,{leagueId:'NEW',nationId:'B',clubId:'NEW'})]);
  expect(rows).toHaveLength(1);expect(rows[0].newLeagueWarning).toBe(true);expect(rows[0].linkName).toBe('');
});
test('all-meta retains exclusions, player identity and slot requirements',async()=>{
  const rows=await recommend(null,opts({currentSquad:locked,excludedCardVersionIds:[2],slotRequirements:{CM:{minSm:4}}}),
    [card(2,{sm:4}),card(3,{sm:4,player_id:1}),card(4,{sm:3}),card(5,{sm:4})]);
  expect(rows.map(row=>row.card.id)).toEqual([5]);
});
