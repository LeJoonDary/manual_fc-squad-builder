import { expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { buildPlayerQuery, createDefaultFilters, fetchPlayers } from './playerFilters.js';

function database(responses = []) {
  const requests = [];
  const db = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, options) => {
      requests.push({ url: new URL(url), body: options.body && JSON.parse(options.body), signal: options.signal });
      return new Response(JSON.stringify(responses.shift() ?? []), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  return { db, requests };
}

test('default query limits after server filtering and orders overall descending', async () => {
  const { db, requests } = database();
  await buildPlayerQuery(db, createDefaultFilters());
  expect(requests[0].url.pathname).toBe('/rest/v1/rpc/filter_player_cards');
  expect(requests[0].url.searchParams.get('order')).toBe('overall.desc.nullslast,id.asc');
  expect(requests[0].url.searchParams.get('limit')).toBe('50');
});

test('combines all relationship predicates and scalar ranges in the same DB query', async () => {
  const filters = createDefaultFilters();
  Object.assign(filters, {
    name: ' 손흥민 ', positions: new Set(['ST', 'LW']), onlyPrimary: true, hasAllPositions: true,
    selectedRoles: [{ position: 'ST', name: 'Poacher', level: 2 }], hasAllRoles: true,
    selectedNormalIds: [7], selectedPlusIds: [7, 8], requireAllPlaystyles: true,
    minPlaystyles: 0, maxPlaystyles: 4, minPlaystylesPlus: 1, maxPlaystylesPlus: 3,
    minOvr: 80, maxOvr: 95, minPrice: 0, maxPrice: 50000, minSm: 4, minWf: 5,
    nation: '1', league: '2', club: '3', gender: 'Male', preferredFoot: 'Right',
    minAge: 18, maxAge: 30, minHeight: 170, maxHeight: 190, minWeight: 60, maxWeight: 90,
    rarities: new Set(['Gold', 'Special']), acceleTypes: new Set(['Controlled']), bodyTypes: new Set(['Lean Medium']),
  });
  filters.stats.pac = { min: 85, max: 99 };
  const { db, requests } = database();
  const query = buildPlayerQuery(db, filters);
  filters.positions.clear(); // The running query must retain its original selection.
  await query;
  const { url, body } = requests[0];
  expect(body.filters.positions).toEqual(['ST', 'LW']);
  expect(body.filters.name).toBe('');
  expect(body.filters.selectedRoles).toEqual([{ position: 'ST', name: 'Poacher', level: 2 }]);
  expect(body.filters.selectedPlayStyles).toEqual([
    { id: 7, level: 'normal' }, { id: 7, level: 'plus' }, { id: 8, level: 'plus' },
  ]);
  expect(body.filters.requireAllPlaystyles).toBe(true);
  expect(body.filters.maxPlaystylesPlus).toBe(3);
  expect(url.searchParams.getAll('overall')).toEqual(['gte.80', 'lte.95']);
  expect(url.searchParams.getAll('price')).toEqual(['gte.0', 'lte.50000']);
  expect(url.searchParams.get('sm')).toBe('gte.4');
  expect(url.searchParams.get('wf')).toBe('gte.5');
  expect(url.searchParams.get('players.nation_id')).toBe('eq.1');
  expect(url.searchParams.get('club_id')).toBe('eq.3');
  expect(url.searchParams.getAll('player_stats.pac')).toEqual(['gte.85', 'lte.99']);
  expect(url.searchParams.get('body_type')).toBe('eq.Lean Medium');
  expect(url.searchParams.get('select')).toContain('player_stats!inner');
});

test('default and name queries are bounded, and repeats use the result cache', async () => {
  const card = { id: 1, players: { name: 'Mbappé' } };
  const { db, requests } = database([[card], [{ id: 100, name: 'Mbappé' }], [card]]);
  const filters = createDefaultFilters();
  expect((await fetchPlayers(db, filters)).map(row => row.id)).toEqual([1]);
  expect((await fetchPlayers(db, { ...filters, name: 'mbappe' })).map(row => row.id)).toEqual([1]);
  expect(requests).toHaveLength(3);
  await fetchPlayers(db, { ...filters, name: 'mbappe' });
  expect(requests).toHaveLength(3);
  expect(requests.every(request => !request.url.pathname.includes('/rpc/'))).toBe(true);
});

test('advanced filters use the existing RPC with a 50-card limit and preserve inner stat filters', async () => {
  const card = { id: 1, players: { name: 'Mbappé' } };
  const { db, requests } = database([[{ id: 100, name: 'Mbappé' }], [card], [card]]);
  const filters = { ...createDefaultFilters(), name: 'mbappe', minOvr: 80 };
  filters.stats.pac = { min: 80, max: 99 };
  expect((await fetchPlayers(db, filters)).map(row => row.id)).toEqual([1]);
  expect(requests).toHaveLength(3);
  expect(requests[1].url.pathname).toBe('/rest/v1/rpc/filter_player_cards');
  expect(requests[1].body.filters.name).toBe('');
  expect(requests[1].url.searchParams.get('player_id')).toBe('in.(100)');
  expect(requests[1].url.searchParams.get('limit')).toBe('50');
  expect(requests[1].url.searchParams.get('select')).toContain('player_stats!inner');
  expect(requests[1].url.searchParams.get('select')).not.toContain('player_stats!inner(pac');
  expect(requests[2].url.pathname).toBe('/rest/v1/card_versions');
  expect(requests[2].url.searchParams.get('id')).toBe('in.(1)');
  expect(requests[2].url.searchParams.get('limit')).toBe('50');
  await fetchPlayers(db, filters);
  expect(requests).toHaveLength(3);
});
test('clear all resets nested state without retaining previous selections', () => {
  const filters = createDefaultFilters();
  filters.positions.add('GK');
  filters.stats.pac.min = 90;
  filters.selectedRoles.push({ position: 'GK', name: 'Goalkeeper', level: 2 });
  Object.assign(filters, createDefaultFilters());
  expect(filters).toEqual(createDefaultFilters());
});
