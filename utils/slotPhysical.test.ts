import { expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { FORMATIONS } from './formations.js';
import { matchesSlotRequirements, fetchCandidatePlayers, generateOptimalSquad } from './autoBuildUtils';
import { countPhysicalRequirements } from './physicalFilters.js';

const physical = { bodyTypes: ['Unique'], acceleTypes: ['Explosive'], preferredFoot: 'Right', gender: 'Male', minHeight: 170, maxHeight: 190, minWeight: 65, maxWeight: 85 };
const mbappe = { body_type: 'Kylian Mbappé', body_type_group: 'Unique', accele_type: 'Controlled Explosive', preferred_foot: 'Right', players: { gender: 'Male', height: 182, weight: 75 } };
test('slot physical criteria combine groups, exact choices and inclusive measurement ranges', () => {
  expect(matchesSlotRequirements(mbappe, { physical }, 'LS')).toBe(true);
  expect(matchesSlotRequirements({ raw: mbappe }, { physical }, 'LS')).toBe(true);
  expect(matchesSlotRequirements({ card: { raw: mbappe } }, { physical }, 'LS')).toBe(true);
  for (const patch of [{ body_type_group: null }, { accele_type: 'Lengthy' }, { preferred_foot: 'Left' },
    { players: { ...mbappe.players, gender: 'Female' } }, { players: { ...mbappe.players, height: 191 } },
    { players: { ...mbappe.players, weight: null } }]) {
    expect(matchesSlotRequirements({ ...mbappe, ...patch }, { physical }, 'LS')).toBe(false);
  }
  expect(matchesSlotRequirements(mbappe, { physical: { acceleTypes: ['Controlled'] } }, 'LS')).toBe(false);
  expect(matchesSlotRequirements({ ...mbappe, body_type_group: 'Stocky Short' }, { physical: { bodyTypes: ['Stocky Short', 'Unique'] } }, 'LS')).toBe(true);
  expect(countPhysicalRequirements(physical)).toBe(8);
  expect(countPhysicalRequirements({ acceleTypes: [], preferredFoot: '', minHeight: '' })).toBe(0);
});

test('candidate queries apply slot physical constraints before limiting and keep LS and RS independent', async () => {
  const urls: URL[] = [];
  const db = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async url => { urls.push(new URL(String(url))); return new Response('[]', { headers: { 'Content-Type': 'application/json' } }); } },
  });
  await fetchCandidatePlayers(1000000, '4-4-2', false, db, { slotRequirements: { LS: { physical } } });
  const st = urls.filter(url => url.searchParams.get('candidate_positions.positions.name') === 'in.(ST)');
  expect(st).toHaveLength(2);
  const restricted = st.find(url => url.searchParams.has('body_type_group'))!;
  expect(restricted.searchParams.get('body_type_group')).toBe('eq.Unique');
  expect(restricted.searchParams.get('accele_type')).toBe('ilike.%Explosive%');
  expect(restricted.searchParams.get('preferred_foot')).toBe('eq.Right');
  expect(restricted.searchParams.get('players.gender')).toBe('eq.Male');
  expect(restricted.searchParams.getAll('players.height')).toEqual(['gte.170', 'lte.190']);
  expect(restricted.searchParams.getAll('players.weight')).toEqual(['gte.65', 'lte.85']);
  expect(restricted.searchParams.has('limit')).toBe(true);
  expect(restricted.searchParams.get('select')).toContain('gender,height,weight');
  expect(st.filter(url => !url.searchParams.has('body_type_group'))).toHaveLength(1);
});

test('auto build and improvement keep an eligible Unique Explosive striker in LS', async () => {
  const slots = FORMATIONS.find(f => f.name === '4-4-2')!.slots;
  const make = (id, position, overall, extra = {}) => ({ id, player_id: id, position, overall, sm: 5, wf: 5,
    price: 20000, phy: 80, facePace: 90, def: 80, leagueId: 100, nationId: 1, clubId: 1, ...extra });
  const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'LS').map((s, i) =>
    [s.position, { card: make(i, s.position, 90, { isIcon: true }), isLocked: true, isOwned: true }]));
  const result = await generateOptimalSquad('4-4-2', { FW: [
    make(100, 'ST', 85, mbappe), make(101, 'ST', 99, { ...mbappe, accele_type: 'Lengthy' }),
    make(102, 'ST', 98, { ...mbappe, body_type_group: 'Lean Tall' }),
  ], MF: [], DF: [] }, 1000000, 33, false, { currentSquad, slotRequirements: { LS: { physical } } });
  expect(result.success).toBe(true);
  expect(result.squad.find(p => p.slotPosition === 'LS')?.id).toBe('100');
});

test('LS finishing and composure requirements survive auto build and upgrades', async () => {
  const slots = FORMATIONS.find(f => f.name === '4-4-2')!.slots;
  const make = (id, position, overall, finishing = 88, composure = 85) => ({ id, player_id: id, position, overall,
    price: 20000, phy: 80, facePace: 90, def: 80, leagueId: 100, nationId: 1, clubId: 1, player_stats: { finishing, composure } });
  const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'LS').map((s, i) =>
    [s.position, { card: { ...make(i, s.position, 90), isIcon: true }, isLocked: true, isOwned: true }]));
  const result = await generateOptimalSquad('4-4-2', { FW: [make(100, 'ST', 85), make(101, 'ST', 99, 87), make(102, 'ST', 98, 99, 84)], MF: [], DF: [] },
    1000000, 33, false, { currentSquad, slotRequirements: { LS: { detailedStats: { finishing: { min: 88 }, composure: { min: 85 } } } } });
  expect(result.success).toBe(true);
  expect(result.squad.find(p => p.slotPosition === 'LS')?.id).toBe('100');
});

test('detailed stats queries filter parents through an inner join before LIMIT', async () => {
  const urls: URL[] = [];
  const db = createClient('https://example.supabase.co', 'test-key', { auth: { persistSession: false }, global: { fetch: async url => {
    urls.push(new URL(String(url))); return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
  } } });
  await fetchCandidatePlayers(1000000, '4-4-2', false, db, { slotRequirements: { LS: { detailedStats: { finishing: { min: 88 }, composure: { min: 85, max: 99 } } } } });
  const query = urls.find(url => url.searchParams.has('player_stats.finishing'))!.searchParams;
  expect(query.get('select')).toContain('player_stats!inner(');
  expect(query.get('select')).toContain('reactions');
  expect(query.get('select')).toContain('sliding_tackle');
  expect(query.get('player_stats.finishing')).toBe('gte.88');
  expect(query.getAll('player_stats.composure')).toEqual(['gte.85', 'lte.99']);
  expect(query.has('limit')).toBe(true);
});
