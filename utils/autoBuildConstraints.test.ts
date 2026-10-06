import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCandidatePlayers, generateOptimalSquad, getPositionBudgetGroup, type CandidateGroups } from './autoBuildUtils';
import { createSquadCandidateRows } from '../scripts/mocks/squadCandidates.js';
import { createCandidateMockDb } from '../scripts/mocks/candidateDb.js';

function fixture() {
  const rows = createSquadCandidateRows();
  const groups: CandidateGroups = { FW: [], MF: [], DF: [] };
  rows.forEach(row => groups[getPositionBudgetGroup(row.card_positions[0].positions.name, false)].push(row));
  return { rows, groups };
}
describe('owned, locked and special-card constraints', () => {
  it.each([0, 100])('keeps zero-price locks and excludes free or null owned replacements even in fallback (budget %s)', async budget => {
    const { rows, groups } = fixture();
    const locked = { ...rows[0], id: 9001, price: 0 };
    const free = { ...rows[3], id: 9002, price: 0 };
    const missing = { ...rows[3], id: 9003, price: null };
    groups.FW.push(free, missing);
    const result = await generateOptimalSquad('4-3-3', groups, budget, 0, false, {
      excludeZeroPriceCards: true,
      currentSquad: { LW: { card: locked, isLocked: true }, ST: { card: free, isOwned: true }, RW: { card: missing, isOwned: true } },
    });
    expect(result.squad).toHaveLength(budget === 0 ? 11 : 1);
    expect(result.squad[0]).toMatchObject({ id: '9001', isLocked: true, price: 0 });
    expect(result.squad.filter(p => !p.isLocked).every(p => Number(p.card.price) > 0)).toBe(true);
    expect(result.status).toBe(budget === 0 ? 'success' : 'incomplete');
  });
  it('builds around a 3M locked defender using a separate 1M allowance for open DF slots', async () => {
    const { rows } = fixture();
    const locked = { ...rows.find(row => row.card_positions[0].positions.name === 'CB')!, price: 3000000 };
    const options = { currentSquad: { LCB: { card: locked, isLocked: true } } };
    const db = createCandidateMockDb(rows);
    const candidates = await fetchCandidatePlayers(5000000, '4-3-3', false,
      db as unknown as SupabaseClient, options);
    const result = await generateOptimalSquad('4-3-3', candidates, 5000000, 0, false, options);
    expect(result.success).toBe(true);
    expect(result.squad).toHaveLength(11);
    expect(result.squad.find(p => p.slotPosition === 'LCB')).toMatchObject({ id: String(locked.id), price: 3000000, isLocked: true });
    expect(result.totalCost).toBeLessThanOrEqual(5000000);
  });

  it('keeps the target price filter when locks already exceed the budget', async () => {
    const { rows } = fixture();
    const locked = { ...rows[0], price: 3000000 };
    const options = { currentSquad: { LW: { card: locked, isLocked: true } } };
    const db = createCandidateMockDb(rows);
    const candidates = await fetchCandidatePlayers(100, '4-3-3', false,
      db as unknown as SupabaseClient, options);
    await expect(generateOptimalSquad('4-3-3', candidates, 100, 0, false, options))
      .rejects.toThrow('Locked players exceed the target budget');
    expect(db.calls.every(call => call.max <= 100 && call.limit <= 120)).toBe(true);
  });
  it('keeps a locked card in its exact slot with zero owned cost despite higher-scoring candidates', async () => {
    const { rows, groups } = fixture();
    const owned = { ...rows[0], price: 90000000 };
    const currentSquad = { LW: { card: owned, isLocked: true, isOwned: true } };
    const before = structuredClone(currentSquad);
    const result = await generateOptimalSquad('4-3-3', groups, 500000, 33, false, { currentSquad });
    expect(result.success).toBe(true);
    expect(result.totalCost).toBeLessThanOrEqual(500000);
    expect(result.squad[0]).toMatchObject({ id: String(owned.id), slotPosition: 'LW', isLocked: true, isOwned: true, price: 0 });
    expect(result.squad[0].card.price).toBe(90000000);
    expect(currentSquad).toEqual(before);
  });

  it('injects owned cards missing from fetched candidates and counts unpaid locked cards', async () => {
    const { rows, groups } = fixture();
    const currentSquad = { LW: { card: rows[2], isOwned: true }, ST: { card: rows[3], isLocked: true } };
    groups.FW = groups.FW.filter(card => card.id !== rows[2].id);
    const result = await generateOptimalSquad('4-3-3', groups, 500000, 0, false, { currentSquad });
    expect(result.success).toBe(true);
    expect(result.squad[0]).toMatchObject({ id: String(rows[2].id), price: 0, isOwned: true });
    expect(result.squad[1]).toMatchObject({ id: String(rows[3].id), price: 30000, isLocked: true });
  });

  it.each([0, 1, 2])('enforces a combined Icon/Hero cap of %i', async maxSpecialCards => {
    const { rows, groups } = fixture();
    rows.forEach((row, index) => { if (index % 3 === 2) row.card_type = index % 2 ? 'SPECIAL_ICON' : 'SPECIAL_HERO'; });
    const result = await generateOptimalSquad('4-3-3', groups, 1000000, 0, false, { maxSpecialCards });
    expect(result.success).toBe(true);
    expect(result.squad.filter(p => p.isIcon || p.isHero).length).toBeLessThanOrEqual(maxSpecialCards);
  });

  it('rejects a locked special count exceeding the limit', async () => {
    const { rows, groups } = fixture();
    const currentSquad = { LW: { card: { ...rows[0], card_type: 'ICON' }, isLocked: true, isOwned: true } };
    await expect(generateOptimalSquad('4-3-3', groups, 1000000, 0, false, { currentSquad, maxSpecialCards: 0 })).rejects.toThrow('Locked');
  });

  it('keeps all 11 locked owned players at zero budget without any candidates', async () => {
    const { groups } = fixture();
    const initial = await generateOptimalSquad('4-3-3', groups, 1000000, 0, false);
    const currentSquad = Object.fromEntries(initial.squad.map(player => [player.slotPosition, { card: player.card, isOwned: true, isLocked: true }]));
    const result = await generateOptimalSquad('4-3-3', { FW: [], MF: [], DF: [] }, 0, 0, false, { currentSquad });
    expect(result.success).toBe(true);
    expect(result.totalCost).toBe(0);
    expect(result.squad.every(player => player.isLocked && player.isOwned)).toBe(true);
    expect(result.squad.map(player => player.id)).toEqual(initial.squad.map(player => player.id));
  });

  it('filters specials before DB limits and bypasses price caps for owned cards', async () => {
    const { rows } = fixture();
    rows[2].card_type = 'SPECIAL_ICON';
    const owned = { ...rows[0], price: 9000000 };
    const db = createCandidateMockDb(rows);
    const result = await fetchCandidatePlayers(1000000, '4-3-3', false,
      db as unknown as SupabaseClient, { currentSquad: { LW: { card: owned, isOwned: true } }, maxSpecialCards: 0 });
    expect(result.find(card => card.id === owned.id)).toMatchObject({ isOwned: true, price: 9000000 });
    expect(result.some(card => card.id === rows[2].id)).toBe(false);
    expect(db.calls.every(call => call.or?.includes('SPECIAL_ICON'))).toBe(true);
  });
});
