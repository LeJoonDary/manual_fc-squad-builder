import { expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { loadAlternativePlayers, fetchAlternativeCards, suggestAlternativePlayers } from './alternativePlayers.js';
import { adaptChemistryPlayerCard, calculateChemistry } from './chemistry.ts';

const card = (id, extra = {}) => ({ id, name: id, position: 'CB', overall: 80,
  price: 100, nation_id: 1, league_id: 1, club_id: 1, ...extra });
const squad = { LCB: { card: card('current', { price: 300 }) }, RCB: { card: card('fixed', { price: 700 }) } };
const base = { squad, targetPosition: 'LCB', maxBudget: 1000, minChemistryTarget: 0 };
function database(pages) {
  const requests = [];
  const db = createClient('https://example.supabase.co', 'test', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async url => {
      requests.push(new URL(url));
      const rows = pages.shift();
      if (!rows) throw new Error('Unexpected extra request');
      return new Response(JSON.stringify(rows), { status: 200 });
    } },
  });
  return { db, requests };
}

test.each([0, 1, 2, 3])('one high query and fallback only for %i qualified candidates', async count => {
  const high = Array.from({ length: count }, (_, i) => card(`high${i}`));
  const lower = [card('lower', { overall: 75 })];
  const { db, requests } = database([high, lower]);
  const result = await loadAlternativePlayers(db, base, row => row);
  expect(result).toEqual(suggestAlternativePlayers({ ...base, candidates: [...high, ...lower] }));
  expect(requests).toHaveLength(count <= 2 ? 2 : 1);
  expect(requests[0].searchParams.get('overall')).toBe('gte.80');
  expect(requests[0].searchParams.get('slot_positions.positions.name')).toBe('eq.CB');
  expect(requests[0].searchParams.get('or')).toBe('(price.lte.300,price.is.null)');
  expect(requests[0].searchParams.get('offset')).toBeNull();
  expect(requests[0].searchParams.get('select')).toContain('players!inner(*,nations(name,flag_url))');
  expect(requests[0].searchParams.get('select')).toContain('clubs(id,name,logo_url)');
  if (count <= 2) expect(requests[1].searchParams.getAll('overall')).toEqual(['gte.75', 'lt.80']);
});

test('fallback depends on chemistry passes, not the fetched candidate count', async () => {
  const high = Array.from({ length: 10 }, (_, i) => card(`unlinked${i}`, { nation_id: 2, league_id: 2, club_id: 2 }));
  const lower = [card('linked', { overall: 79 })];
  const { db, requests } = database([high, lower]);
  const result = await loadAlternativePlayers(db, { ...base, minChemistryTarget: 4 }, row => row);
  expect(result.map(row => row.card.id)).toEqual(['linked']);
  expect(requests).toHaveLength(2);
});

test('manager changes rescue 31 to 33 with no candidate-loop requests; sufficient current manager stays', async () => {
  const positions = ['LB', 'LCB', 'RCB', 'RB', 'LCM', 'CM', 'RCM', 'CAM', 'LS', 'RS', 'GK'];
  const team = Object.fromEntries(positions.map((position, i) => [position, {
    card: card(`p${i}`, { position, league_id: i < 9 ? 1 : 2, nation_id: i < 9 ? 1 : 2, club_id: i < 9 ? 1 : 2 }),
  }]));
  const candidates = Array.from({ length: 3 }, (_, i) => card(`keeper${i}`, { position: 'GK', league_id: 2, nation_id: 2, club_id: 2 }));
  for (const id of [1, 2]) {
    const manager = { leagueId: `league:id:${id}`, nationId: `nation:id:${id}` };
    const options = { squad: team, targetPosition: 'GK', manager, minChemistryTarget: 33 };
    const slots = positions.map(position => ({ position, player: adaptChemistryPlayerCard(position === 'GK' ? candidates[0] : team[position].card) }));
    expect(calculateChemistry(slots, manager).totalChemistry).toBe(id === 1 ? 31 : 33);
    const { db, requests } = database([candidates]);
    const result = await loadAlternativePlayers(db, options, row => row);
    expect(result).toEqual(suggestAlternativePlayers({ ...options, candidates }));
    expect(result).toHaveLength(3);
    expect(result.every(row => row.totalChemistry === 33)).toBe(true);
    if (id === 2) expect(result[0].bestManager).toBe(manager);
    expect(requests).toHaveLength(1);
  }
});

test('owned fixed cards preserve the budget allowance and explicit max price tightens it', async () => {
  const owned = { ...squad, RCB: { ...squad.RCB, isOwned: true } };
  const high = Array.from({ length: 3 }, (_, i) => card(`c${i}`));
  const { db, requests } = database([high]);
  await loadAlternativePlayers(db, { ...base, squad: owned, minPrice: 50, maxPrice: 900 }, row => row);
  expect(requests[0].searchParams.get('or')).toBe('(price.lte.900,price.is.null)');
  expect(requests[0].searchParams.get('price')).toBe('gte.50');
});

test('an aborted operation issues no request', async () => {
  const { db, requests } = database([]);
  const controller = new AbortController();
  controller.abort();
  await expect(loadAlternativePlayers(db, base, row => row, controller.signal)).rejects.toThrow();
  expect(requests).toHaveLength(0);
});

test('a server-truncated batch fails explicitly instead of silently omitting candidates', async () => {
  const query = { select: () => query, eq: () => query, gte: () => query, order: () => query,
    then: resolve => Promise.resolve(resolve({ data: [card('one')], count: 1001 })) };
  await expect(fetchAlternativeCards({ from: () => query }, 'CB')).rejects.toThrow('row limit');
});
