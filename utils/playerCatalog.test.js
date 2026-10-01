import { expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { fetchPlayerListPage, fetchPlayerListByIds, loadPlayerDetail, PLAYER_LIST_SELECT } from './playerCatalog.js';

function database(responses) {
  const requests = [];
  const db = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, options) => {
      requests.push({ url: new URL(url), options });
      const response = await responses.shift();
      return new Response(JSON.stringify(response?.error ? { message: response.error } : response), {
        status: response?.error ? 500 : 200, headers: { 'Content-Type': 'application/json' },
      });
    } },
  });
  return { db, requests };
}
const card = { id: 1, players: { name: 'Groß' }, player_stats: [{ pac: 90 }], card_roles: [], card_playstyles: [], sm: 4, wf: 5, preferred_foot: 'Right' };

test('initial page is one bounded query including card UI data, with no catalog scan or RPC', async () => {
  const { db, requests } = database([[card]]);
  const rows = await fetchPlayerListPage(db);
  expect(rows[0]).toMatchObject({ ...card, summary_only: true });
  expect(requests).toHaveLength(1);
  expect(requests[0].url.pathname).toBe('/rest/v1/card_versions');
  expect(requests[0].url.searchParams.get('limit')).toBe('50');
  expect(PLAYER_LIST_SELECT).toContain('player_stats(pac,sho,pas,dri,def,phy)');
  expect(PLAYER_LIST_SELECT).toContain('card_roles');
  expect(PLAYER_LIST_SELECT).toContain('card_playstyles');
  expect(PLAYER_LIST_SELECT).toContain('sm,wf,preferred_foot');
  expect(PLAYER_LIST_SELECT).not.toContain('*');
  expect(await fetchPlayerListPage(db)).toBe(rows);
  expect(requests).toHaveLength(1);
});

test('rare names use flat player IDs then bounded details, with accent matching and cached results', async () => {
  const { db, requests } = database([[{ id: 100, name: 'Groß' }], [card]]);
  expect((await fetchPlayerListPage(db, { keyword: 'gross' })).map(row => row.id)).toEqual([1]);
  expect(requests[0].url.pathname).toBe('/rest/v1/players');
  expect(requests[0].url.searchParams.get('limit')).toBe('201');
  expect(requests[1].url.searchParams.get('player_id')).toBe('in.(100)');
  expect(requests[1].url.searchParams.get('limit')).toBe('50');
  await fetchPlayerListPage(db, { keyword: 'gross' });
  expect(requests).toHaveLength(2);
});

test('broad names use bounded candidate pages and apply normalized filtering before pagination', async () => {
  const candidates = Array.from({ length: 201 }, (_, id) => ({ id, name: 'Groß' }));
  const { db, requests } = database([candidates,
    [{ ...card, id: 1 }, { ...card, id: 2, players: { name: 'Not matching' } }],
    [{ ...card, id: 3 }, { ...card, id: 4 }],
  ]);
  const rows = await fetchPlayerListPage(db, { keyword: 'gross', offset: 1, limit: 2 });
  expect(rows.map(row => row.id)).toEqual([3, 4]);
  expect(requests.slice(1).map(request => request.url.searchParams.get('offset'))).toEqual(['0', '2']);
  expect(requests.slice(1).every(request => request.url.searchParams.get('limit') === '2')).toBe(true);
});

test('errors are not cached and empty name matches skip card detail queries', async () => {
  const { db, requests } = database([{ error: 'timeout' }, [card], []]);
  await expect(fetchPlayerListPage(db)).rejects.toMatchObject({ message: 'timeout' });
  expect(await fetchPlayerListPage(db)).toHaveLength(1);
  expect(await fetchPlayerListPage(db, { keyword: 'absent' })).toEqual([]);
  expect(requests).toHaveLength(3);
});

test('aborting one consumer does not cancel another sharing the same bounded request', async () => {
  let finish;
  const page = new Promise(resolve => { finish = resolve; });
  const { db, requests } = database([page]);
  const abort = new AbortController();
  const old = fetchPlayerListPage(db, { signal: abort.signal });
  const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
  abort.abort();
  const current = fetchPlayerListPage(db);
  finish([card]);
  await rejected;
  expect(await current).toHaveLength(1);
  expect(requests).toHaveLength(1);
});

test('full details remain on demand and cached separately from list rows', async () => {
  const { db, requests } = database([card]);
  const first = loadPlayerDetail(db, 1);
  expect(loadPlayerDetail(db, '1')).toBe(first);
  expect(await first).toMatchObject({ id: 1 });
  expect(requests).toHaveLength(1);
  expect(requests[0].url.searchParams.get('id')).toBe('eq.1');
});

test('filtered ID hydration preserves rank, rejects partial results and enforces 50-card bounds', async () => {
  const { db, requests } = database([[{ ...card, id: 2 }, card], [card]]);
  expect((await fetchPlayerListByIds(db, [1, 2])).map(row => row.id)).toEqual([1, 2]);
  await expect(fetchPlayerListByIds(db, [1, 3])).rejects.toThrow('일부 선수');
  expect(() => fetchPlayerListByIds(db, Array.from({ length: 51 }, (_, id) => id))).toThrow('50');
  expect(requests).toHaveLength(2);
});
