import { expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { fetchModalPlayerPage } from './modalPlayers.js';
import { PLAYER_LIST_SELECT } from './playerCatalog.js';
import { getRecommendedPlayersForEmptySlot } from './autoBuildUtils';
import { matchesAffiliation } from './affiliationFilters.js';

test('affiliation IDs and max price combine with names, positions, pagination and cache isolation', async () => {
  const requests = [];
  const db = createClient('https://example.supabase.co', 'test', { auth: { persistSession: false }, global: { fetch: async url => {
    const parsed = new URL(url); requests.push(parsed);
    return new Response(JSON.stringify(parsed.pathname.endsWith('/players') ? [{ id: 10, name: 'Player' }] : [{ id: 1, players: { name: 'Player' } }]));
  } } });
  const options = { position: 'ST', keyword: 'Player', maxPrice: 30000, affiliation: { leagueId: '2', clubId: '100', nationId: '5' } };
  await fetchModalPlayerPage(db, options);
  const query = requests.at(-1).searchParams;
  expect(query.get('league_id')).toBe('eq.2'); expect(query.get('club_id')).toBe('eq.100');
  expect(query.get('players.nation_id')).toBe('eq.5'); expect(query.get('price')).toBeNull();
  expect(query.get('player_id')).toBe('in.(10)'); expect(query.get('slot_positions.positions.name')).toBe('eq.ST');
  await fetchModalPlayerPage(db, { ...options, affiliation: { ...options.affiliation, clubId: '200' } });
  expect(requests.at(-1).searchParams.get('club_id')).toBe('eq.200');
  await fetchModalPlayerPage(db, { ...options, maxPrice: 10000 });
  expect(requests.at(-1).searchParams.get('price')).toBeNull();
  expect(requests).toHaveLength(3);
});

test.each(['all_meta', 'meta_synergy', 'instant_chem'])('%s applies affiliation before recommendation LIMIT', async sort => {
  const requests = [];
  const db = createClient('https://example.supabase.co', 'test', { auth: { persistSession: false }, global: { fetch: async url => {
    requests.push(new URL(url)); return new Response('[]');
  } } });
  await getRecommendedPlayersForEmptySlot(db, { formation: '4-3-3', slotPosition: 'ST', totalBudget: 0, slotMaxPrice: 30000,
    sort, currentSquad: sort === 'all_meta' ? {} : { LW: { card: { id: 900, position: 'LW', overall: 90, price: 1000 }, isLocked: true } }, affiliation: { leagueId: '2', clubId: '100', nationId: '5' } });
  const query = requests[0].searchParams;
  expect(query.get('league_id')).toBe('eq.2'); expect(query.get('club_id')).toBe('eq.100');
  expect(query.get('players.nation_id')).toBe('eq.5'); expect(query.getAll('price')).not.toContain('lte.30000');
  expect(query.get('limit')).toBe('300');
  expect(query.has('overall')).toBe(false);
  expect(query.getAll('price')).not.toContain('gt.0');
  expect(matchesAffiliation({ club_id: 200, league_id: 2, players: { nation_id: 5 } }, { clubId: '100' })).toBe(false);
});

test('ST default page fetches only 15 detailed cards and more uses the next offset', async () => {
  const requests = [];
  const db = createClient('https://example.supabase.co', 'test', {
    auth: { persistSession: false }, global: { fetch: async url => {
      requests.push(new URL(url));
      return new Response(JSON.stringify([{ id: requests.length }]), { status: 200 });
    } },
  });
  expect(await fetchModalPlayerPage(db, { position: 'ST' })).toHaveLength(1);
  await fetchModalPlayerPage(db, { position: 'ST', offset: 15 });
  expect(requests).toHaveLength(2);
  expect(requests[0].pathname).toBe('/rest/v1/card_versions');
  expect(requests[0].searchParams.get('select')).toBe(
    (PLAYER_LIST_SELECT + ',slot_positions:card_positions!inner(is_primary,positions!inner(name))').replace(/\s/g, ''),
  );
  expect(requests[0].searchParams.get('slot_positions.is_primary')).toBeNull();
  expect(requests[0].searchParams.get('slot_positions.positions.name')).toBe('eq.ST');
  expect(requests[0].searchParams.get('limit')).toBe('15');
  expect(requests[1].searchParams.get('offset')).toBe('15');
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
  await fetchModalPlayerPage(db, { position: 'RW', positionMode: 'secondary', offset: 15 });
  expect(requests.at(-1).searchParams.get('slot_positions.is_primary')).toBe('eq.false');
  expect(requests.at(-1).searchParams.get('offset')).toBe('15');
});

test('picker budgets ignore acquisition costs, pass OBJ/token, and name searches bypass price', async () => {
  const cards = [
    { id: 1, players: { name: 'Player' }, card_type: 'SPECIAL_SBC', price: null, sbc_price: 10000 },
    { id: 2, players: { name: 'Player' }, card_type: 'SPECIAL_SBC', price: 999999, sbc_price: 10001 },
    { id: 3, players: { name: 'Player' }, card_type: 'SPECIAL_SBC', price: null },
    { id: 4, players: { name: 'Player' }, card_type: 'SPECIAL_OBJ', price: null },
    { id: 5, players: { name: 'Player' }, card_type: 'SPECIAL_TOKEN', token_cost: 5, price: 0 },
    { id: 6, players: { name: 'Player' }, price: 500 },
  ];
  const db = createClient('https://example.supabase.co', 'test', { auth: { persistSession: false }, global: { fetch: async url =>
    new Response(JSON.stringify(new URL(url).pathname.endsWith('/players') ? [{ id: 10, name: 'Player' }] : cards)) } });
  expect((await fetchModalPlayerPage(db, { maxPrice: 10000 })).map(card => card.id)).toEqual([1, 2, 3, 4, 5, 6]);
  expect((await fetchModalPlayerPage(db, { keyword: 'Player', maxPrice: 1 })).map(card => card.id)).toEqual([1, 2, 3, 4, 5, 6]);
  const searchOptions = { keyword: 'Player', maxPrice: 1, includeAcquisitionCards: false };
  expect((await fetchModalPlayerPage(db, searchOptions)).map(card => card.id)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(searchOptions.includeAcquisitionCards).toBe(false);
  expect((await fetchModalPlayerPage(db, { includeAcquisitionCards: false })).map(card => card.id)).toEqual([6]);
  expect((await fetchModalPlayerPage(db, { keyword: '   ', includeAcquisitionCards: false })).map(card => card.id)).toEqual([6]);
});
