import { expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { fetchModalPlayerPage } from './modalPlayers.js';
import { PLAYER_LIST_SELECT } from './playerCatalog.js';

test('ST default page fetches only 30 detailed cards and more uses the next offset', async () => {
  const requests = [];
  const db = createClient('https://example.supabase.co', 'test', {
    auth: { persistSession: false }, global: { fetch: async url => {
      requests.push(new URL(url));
      return new Response(JSON.stringify([{ id: requests.length }]), { status: 200 });
    } },
  });
  expect(await fetchModalPlayerPage(db, { position: 'ST' })).toHaveLength(1);
  await fetchModalPlayerPage(db, { position: 'ST', offset: 30 });
  expect(requests).toHaveLength(2);
  expect(requests[0].pathname).toBe('/rest/v1/card_versions');
  expect(requests[0].searchParams.get('select')).toBe(
    (PLAYER_LIST_SELECT + ',slot_positions:card_positions!inner(is_primary,positions!inner(name))').replace(/\s/g, ''),
  );
  expect(requests[0].searchParams.get('slot_positions.is_primary')).toBeNull();
  expect(requests[0].searchParams.get('slot_positions.positions.name')).toBe('eq.ST');
  expect(requests[0].searchParams.get('limit')).toBe('30');
  expect(requests[1].searchParams.get('offset')).toBe('30');
  await fetchModalPlayerPage(db, { position: 'ST' });
  expect(requests).toHaveLength(2);
});

test('slot eligibility modes apply before pagination and keep separate search caches', async () => {
  const requests = [];
  const db = createClient('https://example.supabase.co', 'test', {
    auth: { persistSession: false }, global: { fetch: async url => {
      const request = new URL(url);
      requests.push(request);
      return new Response(JSON.stringify(request.pathname.endsWith('/players')
        ? [{ id: 10, name: 'Mbappé' }]
        : [{ id: 1, players: { name: 'Mbappé' } }]), { status: 200 });
    } },
  });
  for (const positionMode of ['all', 'primary', 'secondary']) {
    expect(await fetchModalPlayerPage(db, { position: 'LW', keyword: 'Mbappe', positionMode })).toHaveLength(1);
  }
  const cards = requests.filter(url => url.pathname.endsWith('/card_versions'));
  expect(cards).toHaveLength(3);
  expect(cards.map(url => url.searchParams.get('slot_positions.is_primary'))).toEqual([null, 'eq.true', 'eq.false']);
  expect(cards.every(url => url.searchParams.get('slot_positions.positions.name') === 'eq.LW')).toBe(true);
  expect(cards.every(url => url.searchParams.get('player_id') === 'in.(10)')).toBe(true);
  await fetchModalPlayerPage(db, { position: 'LW', keyword: 'Mbappe', positionMode: 'all' });
  expect(requests).toHaveLength(4);
  await fetchModalPlayerPage(db, { position: 'RW', positionMode: 'secondary', offset: 30 });
  expect(requests.at(-1).searchParams.get('slot_positions.is_primary')).toBe('eq.false');
  expect(requests.at(-1).searchParams.get('offset')).toBe('30');
});
