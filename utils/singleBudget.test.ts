import { describe, expect, it } from 'vitest';
import { calculateMetaPaceScore, generateOptimalSquad, getFocusWeight, getPositionBudgetGroup, type CandidateGroups } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';

const slots = FORMATIONS.find(item => item.name === '4-3-3')!.slots;
const positions = ['LW', 'ST', 'RW', 'CM', 'CM', 'CM', 'LB', 'CB', 'CB', 'RB', 'GK'];
function card(id: number, position: string, price: number, score: number) {
  return { id, player_id: id, position, overall: score, price,
    nationId: 1, leagueId: 1, clubId: 1,
    player_stats: { pac: score, sho: score, pas: score, dri: score, def: score, phy: score,
      composure: score, finishing: score, agility: score, balance: score } };
}
function grouped(rows: ReturnType<typeof card>[]): CandidateGroups {
  const result: CandidateGroups = { FW: [], MF: [], DF: [] };
  for (const row of rows) result[getPositionBudgetGroup(row.position, false)].push(row);
  return result;
}

describe('single shared budget', () => {
  it.each(['attack', 'balanced', 'defense'] as const)('applies only the intended 1.2 score multiplier: %s', async focus => {
    const rows = positions.map((position, i) => card(i + 1, position, 1000, 80));
    const result = await generateOptimalSquad('4-3-3', grouped(rows), 11000, 30, false, { focus });
    expect(result.success).toBe(true);
    for (const player of result.squad) expect(player.metaScore).toBeCloseTo(
      calculateMetaPaceScore(player.card, player.slotPosition) * getFocusWeight(player.slotPosition, focus));
    expect(getFocusWeight('CDM', focus)).toBe(focus === 'defense' ? 1.2 : 1);
    expect(getFocusWeight('LCB', focus)).toBe(focus === 'defense' ? 1.2 : 1);
    expect(getFocusWeight('ST', focus)).toBe(focus === 'attack' ? 1.2 : 1);
    expect(getFocusWeight('GK', focus)).toBe(1);
  });

  it.each(['attack', 'defense'] as const)('spends shared funds first on the selected focus: %s', async focus => {
    const rows = positions.map((position, i) => card(i + 1, position, 10000, 80));
    const currentSquad = Object.fromEntries(slots.filter(s => !['ST', 'LCB'].includes(s.position))
      .map(slot => [slot.position, { card: rows[slots.indexOf(slot)], isLocked: true, isOwned: true }]));
    rows.push(card(100, 'ST', 90000, 95), card(101, 'CB', 90000, 95));
    const result = await generateOptimalSquad('4-3-3', grouped(rows), 100000, 30, false, { focus, currentSquad });
    expect(result.success).toBe(true);
    expect(result.totalCost).toBe(100000);
    expect(result.squad.find(p => p.id === (focus === 'attack' ? '100' : '101'))).toBeDefined();
    expect(result.squad.filter(p => p.isLocked)).toHaveLength(9);
  });

  it('allows a card far above the former equal-share cap and keeps paid locks exact', async () => {
    const rows = positions.map((position, i) => card(i + 1, position, 700, 80));
    rows.push(card(100, 'ST', 900000, 99));
    const currentSquad = { GK: { card: { ...rows[10], price: 50000 }, isLocked: true } };
    const before = structuredClone(currentSquad);
    const result = await generateOptimalSquad('4-3-3', grouped(rows), 1000000, 30, false, { currentSquad });
    expect(result.success).toBe(true);
    expect(result.squad.find(p => p.id === '100')?.price).toBe(900000);
    expect(result.squad.find(p => p.slotPosition === 'GK')).toMatchObject({ id: '11', price: 50000, isLocked: true });
    expect(result.totalCost).toBeLessThanOrEqual(1000000);
    expect(currentSquad).toEqual(before);
  });

  it.each([49999, 300000])('performs at most two upgrades only when at least 50k remains: %s', async budget => {
    const rows = positions.map((position, i) => card(i + 1, position, 650, 50));
    const open = ['ST', 'LCM', 'LCB'];
    const currentSquad = Object.fromEntries(slots.filter(slot => !open.includes(slot.position))
      .map(slot => [slot.position, { card: rows[slots.indexOf(slot)], isLocked: true, isOwned: true }]));
    // Conflicting high-meta versions exhaust the first DFS, yielding a cheap complete seed.
    rows.push(...Array.from({ length: 400 }, (_, i) => ({ ...card(1000 + i, 'ST', 1000, 99), player_id: 11 })));
    rows.push(card(2000, 'ST', 10000, 95), card(2001, 'CM', 10000, 95), card(2002, 'CB', 10000, 95));
    const result = await generateOptimalSquad('4-3-3', grouped(rows), budget, 30, false, { currentSquad });
    expect(result.success).toBe(true);
    expect(result.iterations).toBeGreaterThan(350);
    expect(result.squad.filter(p => Number(p.id) >= 2000)).toHaveLength(budget === 49999 ? 0 : 2);
    expect(result.totalChemistry).toBeGreaterThanOrEqual(30);
    expect(result.totalCost).toBeLessThanOrEqual(budget);
    expect(result.squad.filter(p => p.isLocked)).toHaveLength(8);
  });
});
