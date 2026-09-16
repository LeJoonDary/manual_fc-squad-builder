import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCandidatePlayers, getCandidateBudgetPlan, getPositionBudgetGroup } from './autoBuildUtils';
import { createCandidateMockDb, mockCandidate } from '../scripts/mocks/candidateDb.js';

const ratios = { FW: 40, MF: 35, DF: 25 };
const client = (db: ReturnType<typeof createCandidateMockDb>) => db as unknown as SupabaseClient;

describe('candidate pruning', () => {
  it('uses actual slot counts including GK and the UI role rules', () => {
    expect(getCandidateBudgetPlan(1000000, ratios, '4-3-3', false).map(p => [p.slotCount, p.priceCap]))
      .toEqual([[3, 333333], [3, 291666], [5, 125000]]);
    expect(getCandidateBudgetPlan(1000000, ratios, '3-5-2', true).map(p => p.slotCount)).toEqual([3, 4, 4]);
    expect(getCandidateBudgetPlan(1000000, ratios, '4-4-2', false).map(p => p.slotCount)).toEqual([4, 2, 5]);
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
    const cards = await fetchCandidatePlayers(1000000, ratios, '4-3-3 (4)', false, client(db));
    expect(cards.filter(c => c.candidateGroups.includes('FW'))).toHaveLength(20);
    expect(cards[0].id).toBe(39);
    expect(cards.find(c => c.id === 100)?.candidateGroups).toEqual(['FW', 'MF']);
    expect(cards.find(c => c.id === 100)?.card_positions).toHaveLength(2);
    expect(cards.filter(c => Number(c.id) >= 101)).toHaveLength(0);
    expect(new Set(cards.map(c => c.id)).size).toBe(cards.length);
    expect(db.calls).toHaveLength(3);
    expect(db.calls.map(c => c.limit)).toEqual([20, 20, 30]);
    for (const call of db.calls) {
      expect(call.table).toBe('card_versions');
      expect(call.select).toContain('candidate_positions:card_positions!inner(positions!inner(name))');
      expect(call.positionColumn).toBe('candidate_positions.positions.name');
      expect(call.orders[0]).toEqual({ column: 'overall', ascending: false, nullsFirst: false });
      expect(call.minColumn).toBe('price');
      expect(call.maxColumn).toBe('price');
    }
  });

  it('returns empty results, handles zero budgets without unbounded queries and reports DB errors', async () => {
    const db = createCandidateMockDb([mockCandidate(1, ['ST'], 10)]);
    expect(await fetchCandidatePlayers(0, ratios, '4-3-3', false, client(db))).toEqual([]);
    expect(db.calls.every(call => call.max === 0)).toBe(true);
    const failure = createCandidateMockDb([], { message: 'offline' });
    await expect(fetchCandidatePlayers(1000, ratios, '4-3-3', false, client(failure))).rejects.toThrow('FW 후보 조회 실패: offline');
  });

  it('rejects invalid settings before sending queries', async () => {
    const db = createCandidateMockDb([]);
    for (const budget of [-1, NaN, Infinity]) {
      await expect(fetchCandidatePlayers(budget, ratios, '4-3-3', false, client(db))).rejects.toThrow();
    }
    expect(() => getCandidateBudgetPlan(100, { FW: 1, MF: 1, DF: 1 }, '4-3-3', false)).toThrow();
    expect(() => getCandidateBudgetPlan(100, ratios, 'unknown', false)).toThrow();
    expect(() => getCandidateBudgetPlan(100, ratios, '3-5-2', false)).toThrow();
    expect(db.calls).toHaveLength(0);
  });
});
