import { expect, test } from 'vitest';
import { encodeSquadSharePayload as encode, decodeSquadSharePayload as decode, buildSquadShareUrl, type SquadSharePayload } from './squadShareUtils';
const full = (): SquadSharePayload => ({ version:'v1', formation:'4-3-1-2',
  slots:Array.from({length:11},(_,i)=>({cardVersionId:String(123456+i),isLocked:Boolean(i&1),isOwned:Boolean(i&2)})),
  manager:{leagueId:'13',nationId:'52'},budget:1000000 });
test('full squad, all four flags, formation, manager and budget round trip',()=>{
  const payload=full();expect(decode(encode(payload))).toEqual(payload);
});
test('four locked players keep the exact sparse slot indices',()=>{
  const payload=full();payload.slots=payload.slots.map((s,i)=>[0,3,7,10].includes(i)?{...s!,isLocked:true}:null);
  payload.manager=null;payload.budget=0;
  expect(decode(encode(payload))).toEqual(payload);
});
test('URL uses current path, replaces stale query/hash, and remains compact URL-safe',()=>{
  const url=new URL(buildSquadShareUrl('https://metaxi.net/builder/?old=1#pitch',full()));
  expect(url.pathname).toBe('/builder/');expect([...url.searchParams.keys()]).toEqual(['s']);expect(url.hash).toBe('');
  expect(url.searchParams.get('s')).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(url.href.length).toBeLessThan(250);expect(decode(url.searchParams.get('s'))).toEqual(full());
});
test.each(['','!not-base64','A','ab=c','____',null,undefined,'a'.repeat(4097)])('invalid encoding %s never throws',value=>{
  expect(()=>decode(value)).not.toThrow();expect(decode(value)).toBeNull();
});
test.each(['v2|4-3-1-2|,,,,,,,,,,||','v1|invalid|,,,,,,,,,,||','v1|4-3-1-2|1.4,,,,,,,,,,||',
  'v1|4-3-1-2|,,,,,,,,,||','v1|4-3-1-2|,,,,,,,,,,|%XX,1|', 'v1|4-3-1-2|,,,,,,,,,,||-1',
  'v1|4-3-1-2|,,,,,,,,,,||Infinity'])('malformed payload rejects %s',raw=>{
  expect(decode(btoa(raw).replace(/=/g,''))).toBeNull();
});
test('manager codes, names and large finite budgets round trip',()=>{
  const payload=full();payload.manager={leagueId:'league:name:리그 A',nationId:null};payload.budget=Number.MAX_VALUE;
  expect(decode(encode(payload))).toEqual(payload);
});
