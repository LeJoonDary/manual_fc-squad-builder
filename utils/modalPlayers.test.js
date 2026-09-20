import { expect, test, vi } from 'vitest';
import { fetchModalPlayerPage, MODAL_PLAYER_SELECT } from './modalPlayers.js';
import { createPlayerPagination } from './playerPagination.js';

function mockDb(pages) {
  const calls = [];
  const db = { from: vi.fn(() => {
    const query = {};
    for (const method of ['select','eq','ilike','or','order','limit','range','in']) {
      query[method] = vi.fn((...args) => { calls.push([method,...args]); return query; });
    }
    query.abortSignal = vi.fn(() => Promise.resolve(pages.shift()));
    return query;
  }) };
  return { db, calls };
}

test('filters name and position on the server and fetches only the requested 30-card page', async () => {
  const { db, calls } = mockDb([{data:[{id:8},{id:3}]}, {data:[{id:3},{id:8}]}]);
  const result = await fetchModalPlayerPage(db, {position:'ST',keyword:' Salah ',offset:30});
  expect(result.map(row=>row.id)).toEqual([8,3]);
  expect(calls).toContainEqual(['eq','slot_positions.positions.name','ST']);
  expect(calls).toContainEqual(['or','name.ilike."%Salah%",long_name.ilike."%Salah%"',{referencedTable:'players'}]);
  expect(calls).toContainEqual(['range',30,59]);
  expect(calls.filter(c=>c[0]==='limit')).toEqual([['limit',30],['limit',30]]);
  expect(calls).toContainEqual(['in','id',[8,3]]);
  expect(MODAL_PLAYER_SELECT).not.toContain('*');
});

test('empty results skip detail queries and errors propagate', async () => {
  const {db}=mockDb([{data:[]}]);
  expect(await fetchModalPlayerPage(db,{position:'GK'})).toEqual([]);
  expect(db.from).toHaveBeenCalledTimes(1);
  const error=new Error('timeout');
  await expect(fetchModalPlayerPage(mockDb([{error}]).db,{position:'ST'})).rejects.toThrow('timeout');
});

test('30-row modal pagination advances even when every card is already selected', () => {
  const pager=createPlayerPagination(30);
  pager.complete(pager.begin(),Array.from({length:30},(_,id)=>({id})),[]);
  expect(pager.begin().offset).toBe(30);
  pager.reset();
  expect(pager.begin().offset).toBe(0);
});
