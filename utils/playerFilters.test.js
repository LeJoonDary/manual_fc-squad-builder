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
    selectedPlayStyles: [{ id: 7, level: 'plus' }], requireAllPlaystyles: true,
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
  expect(body.filters.name).toBe('손흥민');
  expect(body.filters.selectedRoles).toEqual([{ position: 'ST', name: 'Poacher', level: 2 }]);
  expect(body.filters.maxPlaystylesPlus).toBe(3);
  expect(url.searchParams.getAll('overall')).toEqual(['gte.80', 'lte.95']);
  expect(url.searchParams.getAll('price')).toEqual(['gte.0', 'lte.50000']);
  expect(url.searchParams.get('sm')).toBe('gte.4');
  expect(url.searchParams.get('wf')).toBe('gte.5');
  expect(url.searchParams.get('players.nation_id')).toBe('eq.1');
  expect(url.searchParams.get('club_id')).toBe('eq.3');
  expect(url.searchParams.getAll('player_stats.pac')).toEqual(['gte.85', 'lte.99']);
  expect(url.searchParams.get('body_type')).toBe('in.(Lean)');
  expect(url.searchParams.get('select')).toContain('player_stats!inner');
});

test('fetches only matching card details and retains database rank', async () => {
  const { db, requests } = database([[{ id: 9001 }, { id: 8001 }], [{ id: 8001 }, { id: 9001 }]]);
  const signal = new AbortController().signal;
  expect(await fetchPlayers(db, createDefaultFilters(), signal)).toEqual([{ id: 9001 }, { id: 8001 }]);
  expect(requests).toHaveLength(2);
  expect(requests[1].url.searchParams.get('id')).toBe('in.(9001,8001)');
  expect(requests.every(request => request.signal === signal)).toBe(true);
});

test('no matches skips the details request', async () => {
  const { db, requests } = database([[]]);
  expect(await fetchPlayers(db, createDefaultFilters())).toEqual([]);
  expect(requests).toHaveLength(1);
});

test('clear all resets nested state without retaining previous selections', () => {
  const filters = createDefaultFilters();
  filters.positions.add('GK');
  filters.stats.pac.min = 90;
  filters.selectedRoles.push({ position: 'GK', name: 'Goalkeeper', level: 2 });
  Object.assign(filters, createDefaultFilters());
  expect(filters).toEqual(createDefaultFilters());
});
