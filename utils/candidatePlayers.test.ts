import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCandidatePlayers, getCandidateBudgetPlan, getPositionBudgetGroup } from './autoBuildUtils';
import { createCandidateMockDb, mockCandidate } from '../scripts/mocks/candidateDb.js';

const allocations = { FW: 400000, MF: 350000, DF: 250000 };
const client = (db: ReturnType<typeof createCandidateMockDb>) => db as unknown as SupabaseClient;

describe('candidate pruning', () => {
  it('deducts locks only from the total, never the open-slot allocation', async () => {
    const currentSquad = {
      LCB: { card: { raw: mockCandidate(900, ['CB'], 3000000) }, isLocked: true },
      GK: { card: mockCandidate(901, ['GK'], 9000000), isLocked: true, isOwned: true },
    };
    const amounts = { FW: 3000000, MF: 3000000, DF: 1000000 };
    const plan = getCandidateBudgetPlan(10000000, amounts, '4-3-3', false, { currentSquad });
    expect(plan[2]).toMatchObject({ remainingBudget: 1000000, remainingTotalBudget: 7000000, slotCount: 3, priceCap: 1000000 });
    expect(plan[2].positions).not.toContain('GK');
    const db = createCandidateMockDb([mockCandidate(1, ['CB'], 950000), mockCandidate(2, ['CB'], 1000001)]);
    const candidates = await fetchCandidatePlayers(10000000, amounts, '4-3-3', false, client(db), { currentSquad });
    expect(candidates.some(card => card.id === 1)).toBe(true);
    expect(candidates.some(card => card.id === 2)).toBe(true); // Cheapest reserves may exceed the soft cap.
    expect(db.calls[2].max).toBe(1000000);
  });

  it.each([0, null, undefined])('fetches top candidates without a price cap for an unset budget (%s)', async budget => {
    const rows = Array.from({ length: 30 }, (_, i) => mockCandidate(i, ['ST', 'CM', 'CB'], 11000 + i * 100, 70 + i));
    const db = createCandidateMockDb(rows);
    const candidates = await fetchCandidatePlayers(budget, { FW: 0, MF: 0, DF: 0 }, '4-3-3', false, client(db));
    expect(candidates).toHaveLength(30);
    expect(candidates[0].id).toBe(29);
    expect(candidates.some(card => Number(card.price) > 12900)).toBe(true);
    expect(db.calls.every(call => call.max === undefined)).toBe(true);
  });

  it('does not query a group whose slots are all locked', async () => {
    const currentSquad = Object.fromEntries(['LW', 'ST', 'RW'].map((position, i) => [position,
      { card: mockCandidate(i, [position], 100), isLocked: true, isOwned: true }]));
    const db = createCandidateMockDb([]);
    await fetchCandidatePlayers(1000000, allocations, '4-3-3', false, client(db), { currentSquad });
    expect(db.calls).toHaveLength(7);
    expect(db.calls.every(call => !call.positions.includes('ST'))).toBe(true);
  });
  it('uses actual slot counts including GK and the UI role rules', () => {
    expect(getCandidateBudgetPlan(1000000, allocations, '4-3-3', false).map(p => [p.slotCount, p.priceCap]))
      .toEqual([[3, 400000], [3, 350000], [5, 250000]]);
    expect(getCandidateBudgetPlan(1000000, allocations, '3-5-2', true).map(p => p.slotCount)).toEqual([3, 4, 4]);
    expect(getCandidateBudgetPlan(1000000, allocations, '4-4-2', false).map(p => p.slotCount)).toEqual([4, 2, 5]);
    expect(getPositionBudgetGroup('CAM', true)).toBe('FW');
    expect(getPositionBudgetGroup('LAM', false)).toBe('FW');
    for (const position of ['LM', 'RM']) {
      expect(getPositionBudgetGroup(position, false)).toBe('FW');
      expect(getPositionBudgetGroup(position, true)).toBe('MF');
    }
  });

  it('filters before limiting, ranks by rating, and keeps secondary positions and deduplicates', async () => {
    const rows = Array.from({ length: 40 }, (_, i) => mockCandidate(i, ['ST'], 10000 + i, 70 + i));
    rows.push(mockCandidate(100, ['CAM', 'CM'], 100000, 99));
    rows.push(mockCandidate(101, ['ST'], 900000, 100));
    rows.push(mockCandidate(102, ['CM'], null, 100));
    rows.push(mockCandidate(103, ['GK'], -1, 100));
    const db = createCandidateMockDb(rows);
    const cards = await fetchCandidatePlayers(1000000, allocations, '4-3-3 (4)', false, client(db));
    expect(cards.filter(c => c.candidateGroups.includes('FW'))).toHaveLength(40);
    expect(cards[0].id).toBe(39);
    expect(cards.find(c => c.id === 100)?.candidateGroups).toEqual(['FW', 'MF']);
    expect(cards.find(c => c.id === 100)?.card_positions).toHaveLength(2);
    expect(cards.filter(c => Number(c.id) >= 101)).toHaveLength(0);
    expect(new Set(cards.map(c => c.id)).size).toBe(cards.length);
    expect(db.calls.filter(call => call.max !== undefined)).toHaveLength(3);
    expect(db.calls.filter(call => call.max !== undefined).map(c => c.limit)).toEqual([20, 20, 30]);
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
    expect(await fetchCandidatePlayers(0, { FW: 0, MF: 0, DF: 0 }, '4-3-3', false, client(db))).toHaveLength(1);
    expect(db.calls.every(call => call.max === 10000 || call.max === undefined)).toBe(true);
    const failure = createCandidateMockDb([], { message: 'offline' });
    await expect(fetchCandidatePlayers(1000000, allocations, '4-3-3', false, client(failure))).rejects.toThrow('FW 후보 조회 실패: offline');
  });

  it('rejects invalid settings before sending queries', async () => {
    const db = createCandidateMockDb([]);
    for (const budget of [-1, NaN, Infinity]) {
      await expect(fetchCandidatePlayers(budget, allocations, '4-3-3', false, client(db))).rejects.toThrow();
    }
    expect(() => getCandidateBudgetPlan(100, { FW: 101, MF: 0, DF: 0 }, '4-3-3', false)).toThrow();
    expect(() => getCandidateBudgetPlan(100, allocations, 'unknown', false)).toThrow();
    expect(() => getCandidateBudgetPlan(100, allocations, '3-5-2', false)).toThrow();
    expect(db.calls).toHaveLength(0);
  });
});
