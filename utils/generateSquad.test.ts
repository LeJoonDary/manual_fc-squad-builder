import { describe, expect, it } from 'vitest';
import { generateOptimalSquad, calculateSquadChemistry, type CandidateGroups } from './autoBuildUtils';
import { createSquadCandidateRows } from '../scripts/mocks/squadCandidates.js';
import { getPositionBudgetGroup } from './autoBuildUtils';

function groups(rows = createSquadCandidateRows()): CandidateGroups {
  const result: CandidateGroups = { FW: [], MF: [], DF: [] };
  rows.forEach(row => result[getPositionBudgetGroup(row.card_positions[0].positions.name, false)].push(row));
  return result;
}

describe('generateOptimalSquad', () => {
  it.each([0, null, undefined])('prioritizes quality and 33 chemistry without a budget (%s)', async budget => {
    const result = await generateOptimalSquad('4-3-3', groups(), budget, 33, false);
    expect(result.success).toBe(true);
    expect(result.totalChemistry).toBe(33);
    expect(result.totalCost).toBe(990000);
  });

  it('clusters slightly more expensive cheap cards instead of selecting isolated price minima', async () => {
    const base = createSquadCandidateRows().filter(row => (row.id - 1) % 3 === 0);
    const isolated = base.map((row, i) => ({ ...row, price: 1000, club_id: 100 + i, league_id: 100 + i,
      players: { ...row.players, nation_id: 100 + i } }));
    const linked = base.map(row => ({ ...row, id: row.id + 1000, player_id: row.id + 1000, price: 1100 }));
    const result = await generateOptimalSquad('4-3-3', groups([...isolated, ...linked]), 100, 33, false);
    expect(result.status).toBe('fallback');
    expect(result.totalChemistry).toBe(33);
    expect(result.totalCost).toBeLessThanOrEqual(12100);
    expect(result.squad).toHaveLength(11);
    expect(new Set(result.squad.map(p => p.playerKey)).size).toBe(11);
    expect(result.iterations).toBeLessThanOrEqual(1500);
  });
  it('builds all exact slots using meta rather than OVR, honors budget, and preserves inputs', async () => {
    const candidates = groups();
    const snapshot = structuredClone(candidates);
    const result = await generateOptimalSquad('4-3-3', candidates, 1000000, 33, true);
    expect(result.success).toBe(true);
    expect(result.squad.map(p => p.slotPosition)).toEqual(['LW', 'ST', 'RW', 'LCM', 'CM', 'RCM', 'LB', 'LCB', 'RCB', 'RB', 'GK']);
    expect(result.squad.every(p => p.card.overall === 97)).toBe(true);
    expect(result.totalCost).toBe(990000);
    expect(new Set(result.squad.map(p => p.playerKey)).size).toBe(11);
    expect(calculateSquadChemistry(result.squad, true).totalChemistry).toBe(result.totalChemistry);
    expect(result.teamMetaScore).toBeCloseTo((92 * 10 + 88) / 11);
    expect(result.iterations).toBeLessThanOrEqual(1500);
    expect(candidates).toEqual(snapshot);
  });

  it('reserves budget and disables managers', async () => {
    const result = await generateOptimalSquad('4-3-3', groups(), 330000, 33, false);
    expect(result.success).toBe(true);
    expect(result.totalCost).toBe(330000);
    expect(result.manager).toBeNull();
  });

  it('replaces isolated expensive-meta players to meet chemistry', async () => {
    const rows = createSquadCandidateRows().filter(row => (row.id - 1) % 3 === 0);
    const isolated = structuredClone(rows[0]);
    isolated.id = 999; isolated.player_id = 999;
    isolated.players = { id: 999, name: 'Isolated', nation_id: 999 };
    isolated.league_id = 999; isolated.club_id = 999;
    Object.keys(isolated.player_stats).forEach(key => isolated.player_stats[key] = 99);
    const result = await generateOptimalSquad('4-3-3', groups([...rows, isolated]), 1000000, 33, false);
    expect(result.success).toBe(true);
    expect(result.squad.some(p => p.id === '999')).toBe(false);
  });

  it('reports incomplete and impossible-budget squads honestly', async () => {
    const empty = await generateOptimalSquad('4-3-3', { FW: [], MF: [], DF: [] }, 100, 33, false);
    expect(empty.status).toBe('incomplete');
    expect(empty.success).toBe(false);
    expect(empty.squad).toEqual([]);
    const impossible = await generateOptimalSquad('4-3-3', groups(), 1, 33, false);
    expect(impossible.success).toBe(false);
    expect(impossible.status).toBe('fallback');
    expect(impossible.squad).toHaveLength(11);
    expect(impossible.totalCost).toBe(330000);
    expect(impossible.iterations).toBeLessThanOrEqual(1500);
  });

  it('does not field multiple cards of the same underlying player', async () => {
    const rows = createSquadCandidateRows();
    rows.forEach(row => row.player_id = 1);
    const result = await generateOptimalSquad('4-3-3', groups(rows), 1000000, 0, false);
    expect(result.success).toBe(false);
    expect(result.squad.length).toBeLessThanOrEqual(1);
  });

  it('rejects invalid constraints', async () => {
    await expect(generateOptimalSquad('nope', groups(), 1, 0, false)).rejects.toThrow();
    await expect(generateOptimalSquad('4-3-3', groups(), NaN, 0, false)).rejects.toThrow();
    await expect(generateOptimalSquad('4-3-3', groups(), 1, 34, false)).rejects.toThrow();
  });

  it('backtracks when an early high-meta choice blocks a later player identity', async () => {
    const rows = createSquadCandidateRows().filter(row => (row.id - 1) % 3 === 0);
    const alternative = structuredClone(rows[0]);
    alternative.id = 888; alternative.player_id = 888;
    const blocked = rows[0];
    blocked.player_id = rows[1].player_id;
    Object.keys(blocked.player_stats).forEach(key => blocked.player_stats[key] = 99);
    const result = await generateOptimalSquad('4-3-3', groups([...rows, alternative]), 1000000, 0, false);
    expect(result.success).toBe(true);
    expect(result.squad.find(p => p.slotPosition === 'LW')?.id).toBe('888');
  });
});
