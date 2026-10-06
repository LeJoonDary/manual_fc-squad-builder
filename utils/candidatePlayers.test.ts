import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCandidatePlayers, getPositionBudgetGroup } from './autoBuildUtils';
import { createCandidateMockDb, mockCandidate } from '../scripts/mocks/candidateDb.js';

const client = (db: ReturnType<typeof createCandidateMockDb>) => db as unknown as SupabaseClient;

describe('candidate pruning', () => {
  it('filters fullbacks/GK at fixed caps before the 120-row limit and loads CB aerial attributes', async () => {
    const rows = ['LB', 'RB', 'GK', 'CB'].flatMap((position, i) => [
      mockCandidate(i * 2, [position], 40000, 80), mockCandidate(i * 2 + 1, [position], 40001, 99),
    ]);
    const db = createCandidateMockDb(rows);
    const cards = await fetchCandidatePlayers(500000, '4-3-3', false, client(db));
    expect(cards.map(card => card.id).sort()).toEqual([0, 2, 4, 6, 7]);
    expect(db.calls.every(call => call.limit === 120)).toBe(true);
    expect(db.calls.every(call => call.select.includes('gender,height') && call.select.includes('jumping'))).toBe(true);
  });
  it.each([0, 1000000])('bounds every position to one top-120 query with thousands of cards (budget %s)', async budget => {
    const rows = Array.from({ length: 2000 }, (_, i) => mockCandidate(i + 1, ['ST', 'LW', 'RW', 'CM', 'CB', 'LB', 'RB', 'GK'], 50000, 80 + i % 20));
    const db = createCandidateMockDb(rows);
    const cards = await fetchCandidatePlayers(budget, '4-3-3', false, client(db), {
    });
    expect(cards).toHaveLength(120);
    expect(cards.every(card => Number(card.overall) >= 98)).toBe(true);
    expect(db.calls).toHaveLength(8);
    for (const call of db.calls) {
      expect(call.limit).toBe(120);
      expect(call.range).toBeUndefined();
      expect(call.positions).toHaveLength(1);
      expect(call.ovrMin).toBe(80);
      expect(call.max).toBe(budget ? ({ ST: 595000, LW: 340000, RW: 340000, CM: 120000, CB: 200000, LB: 80000, RB: 80000, GK: 80000 }[call.positions[0]]) : undefined);
      expect(call.select).not.toContain('*');
      expect(call.select).toContain('player_stats(pac,sho,pas,dri,def,phy');
      expect(call.select).toContain('card_roles(role_level,roles(position,role_name))');
    }
  });
  it.each([0, 1000000])('filters unpriced cards before limits and owned injection (budget %s)', async budget => {
    const free = mockCandidate(1, ['ST'], 0, 99);
    const missing = mockCandidate(2, ['ST'], null, 99);
    const paid = mockCandidate(3, ['ST'], 100, 80);
    const db = createCandidateMockDb([free, missing, paid]);
    const cards = await fetchCandidatePlayers(budget, '4-3-3', false, client(db), {
      excludeZeroPriceCards: true, currentSquad: { ST: { card: free, isOwned: true }, LW: { card: missing, isOwned: true } },
    });
    expect(cards.map(card => card.id)).toEqual([3]);
    expect(db.calls.every(call => call.gt?.column === 'price' && call.gt.value === 0)).toBe(true);
    const allowed = await fetchCandidatePlayers(budget, '4-3-3', false, client(createCandidateMockDb([free, paid])), { excludeZeroPriceCards: false });
    expect(allowed.map(card => card.id)).toContain(1);
  });
  it.each([0, 1000000])('excludes only the selected version in every query and owned-card path (budget %s)', async budget => {
    const banned = { ...mockCandidate(100, ['ST', 'CM', 'CB'], 0, 99), player_id: 7 };
    const variant = { ...banned, id: 101 };
    const allowed = { ...mockCandidate(7, ['ST', 'CM', 'CB'], 0, 80), player_id: 8 };
    const db = createCandidateMockDb([banned, variant, allowed]);
    const cards = await fetchCandidatePlayers(budget, '4-3-3', false, client(db), {
      excludedCardVersionIds: ['100'], currentSquad: { ST: { card: { raw: banned }, isOwned: true } },
    });
    expect(cards.map(card => card.id).sort((a, b) => Number(a) - Number(b))).toEqual([7, 101]);
    expect(db.calls.length).toBeGreaterThan(3);
    expect(db.calls.every(call => call.not?.column === 'id' && call.not.operator === 'in' && call.not.value === '(100)')).toBe(true);
  });

  it('omits the exclusion query for an empty list and rejects excluded locks before querying', async () => {
    const db = createCandidateMockDb([]);
    await fetchCandidatePlayers(1000000, '4-3-3', false, client(db), { excludedCardVersionIds: [] });
    expect(db.calls.every(call => !call.not)).toBe(true);
    const lockedDb = createCandidateMockDb([]);
    await expect(fetchCandidatePlayers(1000000, '4-3-3', false, client(lockedDb), {
      excludedCardVersionIds: [90], currentSquad: { ST: { card: { ...mockCandidate(90, ['ST'], 0), player_id: 9 }, isLocked: true } },
    })).rejects.toThrow('An excluded card is locked in your squad');
    expect(lockedDb.calls).toHaveLength(0);
  });
  it('deducts locks only from the total, never the open-slot allocation', async () => {
    const currentSquad = {
      LCB: { card: { raw: mockCandidate(900, ['CB'], 3000000) }, isLocked: true },
      GK: { card: mockCandidate(901, ['GK'], 9000000), isLocked: true, isOwned: true },
    };

    const db = createCandidateMockDb([mockCandidate(1, ['CB'], 500000), mockCandidate(2, ['CB'], 500001)]);
    const candidates = await fetchCandidatePlayers(10000000, '4-3-3', false, client(db), { currentSquad });
    expect(candidates.some(card => card.id === 1)).toBe(true);
    expect(candidates.some(card => card.id === 2)).toBe(true); // No query may exceed the group ceiling.

  });

  it.each([0, null, undefined])('fetches top candidates without a price cap for an unset budget (%s)', async budget => {
    const rows = Array.from({ length: 30 }, (_, i) => mockCandidate(i, ['ST', 'CM', 'CB'], 11000 + i * 100, 70 + i));
    const db = createCandidateMockDb(rows);
    const candidates = await fetchCandidatePlayers(budget, '4-3-3', false, client(db));
    expect(candidates).toHaveLength(20);
    expect(candidates.some(card => card.id === 29)).toBe(true);
    expect(candidates.some(card => Number(card.price) > 12900)).toBe(true);
    expect(db.calls.every(call => call.max === undefined)).toBe(true);
  });

  it('does not query a group whose slots are all locked', async () => {
    const currentSquad = Object.fromEntries(['LW', 'ST', 'RW'].map((position, i) => [position,
      { card: mockCandidate(i, [position], 100), isLocked: true, isOwned: true }]));
    const db = createCandidateMockDb([]);
    await fetchCandidatePlayers(1000000, '4-3-3', false, client(db), { currentSquad });
    expect(db.calls).toHaveLength(5);
    expect(db.calls.every(call => !call.positions.includes('ST'))).toBe(true);
  });
  it('filters before limiting, ranks by rating, and keeps secondary positions and deduplicates', async () => {
    const rows = Array.from({ length: 40 }, (_, i) => mockCandidate(i, ['ST'], 10000 + i, 60 + i));
    rows.push(mockCandidate(100, ['CAM', 'CM'], 100000, 99));
    rows.push(mockCandidate(101, ['ST'], 900000, 99));
    rows.push(mockCandidate(102, ['CM'], null, 100));
    rows.push(mockCandidate(103, ['GK'], -1, 100));
    const db = createCandidateMockDb(rows);
    const cards = await fetchCandidatePlayers(1000000, '4-3-3 (4)', false, client(db));
    expect(cards.filter(c => c.candidateGroups.includes('FW'))).toHaveLength(21);
    expect(cards.some(card => card.id === 101)).toBe(false);
    expect(cards.find(c => c.id === 100)?.candidateGroups).toEqual(['FW', 'MF']);
    expect(cards.find(c => c.id === 100)?.card_positions).toHaveLength(2);
    expect(cards.filter(c => Number(c.id) >= 102)).toHaveLength(0);
    expect(new Set(cards.map(c => c.id)).size).toBe(cards.length);
    expect(db.calls.every(call => call.max === ({ ST: 595000, LW: 340000, RW: 340000, CAM: 680000, CM: 120000, CB: 200000, LB: 80000, RB: 80000, GK: 80000 }[call.positions[0]]))).toBe(true);
    expect(db.calls.every(call => call.limit === 120 && call.range === undefined)).toBe(true);
    for (const call of db.calls.filter(call => call.max !== undefined)) {
      expect(call.table).toBe('card_versions');
      expect(call.select).toContain('candidate_positions:card_positions!inner(positions!inner(name))');
      expect(call.positionColumn).toBe('candidate_positions.positions.name');
      expect(call.orders[0]).toEqual({ column: 'overall', ascending: false, nullsFirst: false });
      expect(call.minColumn).toBe('price');
      expect(call.maxColumn).toBe('price');
    }
  });

  it('fetches minimum-price candidates at zero budget and reports DB errors', async () => {
    const db = createCandidateMockDb([mockCandidate(1, ['ST'], 10)]);
    expect(await fetchCandidatePlayers(0, '4-3-3', false, client(db))).toHaveLength(1);
    expect(db.calls.every(call => call.max === 10000 || call.max === undefined)).toBe(true);
    const failure = createCandidateMockDb([], { message: 'offline' });
    await expect(fetchCandidatePlayers(1000000, '4-3-3', false, client(failure))).rejects.toThrow('FW candidate search failed: offline');
  });

  it('rejects invalid settings before sending queries', async () => {
    const db = createCandidateMockDb([]);
    for (const budget of [-1, NaN, Infinity]) {
      await expect(fetchCandidatePlayers(budget, '4-3-3', false, client(db))).rejects.toThrow();
    }
    expect(db.calls).toHaveLength(0);
  });
});

it.each([{ min: 75, max: 99 }, { min: 45, max: 74 }])('applies OVR bounds to every DB query and owned cards: %s', async squadOvrRange => {
  const rows = [44, 45, 74, 75, 99, 100].map(ovr => mockCandidate(ovr, ['ST', 'CM', 'CB'], 0, ovr));
  const db = createCandidateMockDb(rows);
  const cards = await fetchCandidatePlayers(0, '4-3-3', false, client(db), {
    squadOvrRange, excludedCardVersionIds: ['99'], currentSquad: { ST: { card: rows[0], isOwned: true } },
  });
  expect(db.calls.every(call => call.ovrMin === Math.max(80, squadOvrRange.min) && call.ovrMax === squadOvrRange.max)).toBe(true);
  expect(cards.map(card => card.id)).toEqual([]);
});

it('filters required roles in the DB before the 120-row limit while preserving full role joins', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const calls: URL[] = [];
  const db = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async url => { calls.push(new URL(String(url))); return new Response('[]', { headers: { 'Content-Type': 'application/json' } }); } },
  });
  await fetchCandidatePlayers(1000000, '4-3-3', false, db, {
    isStrictRoleMode: true, slotRoleRequirements: { ST: { roleName: 'Advanced Forward', minLevel: 1 } },
  });
  const st = calls.find(url => url.searchParams.get('candidate_positions.positions.name') === 'in.(ST)')!;
  expect(st.searchParams.get('required_roles.roles.role_name')).toBe('eq.Advanced Forward');
  expect(st.searchParams.get('required_roles.roles.position')).toBe('eq.ST');
  expect(st.searchParams.get('required_roles.role_level')).toBe('gte.1');
  expect(st.searchParams.get('limit')).toBe('120');
  expect(st.searchParams.get('select')).toContain('required_roles:card_roles!inner');
  expect(st.searchParams.get('select')).toContain('card_roles(role_level,roles(position,role_name))');
  expect(calls.filter(url => url.searchParams.has('required_roles.role_level'))).toHaveLength(1);
});
