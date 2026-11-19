import { expect, test, vi } from 'vitest';
import { loadSharedSquadCards } from './squadShareHydration';
import { PLAYER_CARD_SELECT } from './playerCards';
const payload = {formation:'4-3-1-2',slots:Array.from({length:11},(_,i)=> i===0||i===3 ? {cardVersionId:'123',isLocked:i===0,isOwned:i===3}:null)};
test('one full detail query deduplicates IDs and preserves position/flags through normalization',async()=>{
  const raw={id:123,player_stats:[{pac:90}],card_playstyles:[{}],card_roles:[{}]};
  const query={in:vi.fn(async()=>({data:[raw],error:null}))};const select=vi.fn(()=>query);const db={from:vi.fn(()=>({select}))};
  const normalize=vi.fn(card=>({...card,name:'normalized'}));
  const result=await loadSharedSquadCards(db,payload,normalize);
  expect(db.from).toHaveBeenCalledTimes(1);expect(select).toHaveBeenCalledWith(PLAYER_CARD_SELECT);
  expect(query.in).toHaveBeenCalledWith('id',['123']);expect(normalize).toHaveBeenCalledWith(raw);
  const entries=Object.values(result);expect(entries[0]).toMatchObject({isLocked:true,isOwned:false});
  expect(entries[3]).toMatchObject({isLocked:false,isOwned:true});expect(entries.filter(Boolean)).toHaveLength(2);
});
test('missing cards and query errors fail before applying anything',async()=>{
  for(const response of [{data:[],error:null},{data:null,error:new Error('offline')}]) {
    const db={from:()=>({select:()=>({in:async()=>response})})};
    await expect(loadSharedSquadCards(db,payload,x=>x)).rejects.toThrow();
  }
});
test('empty squad does not query DB',async()=>{
  const db={from:vi.fn()};await loadSharedSquadCards(db,{...payload,slots:Array(11).fill(null)},x=>x);
  expect(db.from).not.toHaveBeenCalled();
});
