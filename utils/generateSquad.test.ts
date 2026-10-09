import { describe, expect, it } from 'vitest';
import { generateOptimalSquad, calculateSquadChemistry, calculatePlayerStrength, type CandidateGroups } from './autoBuildUtils';
import { createSquadCandidateRows } from '../scripts/mocks/squadCandidates.js';
import { getPositionBudgetGroup } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';

function groups(rows = createSquadCandidateRows()): CandidateGroups {
  const result: CandidateGroups = { FW: [], MF: [], DF: [] };
  rows.forEach(row => result[getPositionBudgetGroup(row.card_positions[0].positions.name, false)].push(row));
  return result;
}

describe('generateOptimalSquad', () => {
  it('uses the full remaining budget around owned locks', async () => {
    const rows = createSquadCandidateRows().map(row => ({ ...row,
      overall: 78 + ((row.id - 1) % 3) * 5,
      price: (row.id - 1) % 3 === 0 ? 700 : 60000 }));
    const slots = FORMATIONS.find(item => item.name === '4-3-3')!.slots;
    const currentSquad = Object.fromEntries(slots.slice(0, 3).map((slot, i) => [slot.position,
      { card: rows[i * 3], isOwned: true, isLocked: true }]));
    const result = await generateOptimalSquad('4-3-3', groups(rows), 500000, 30, false, {
      currentSquad,
    });
    expect(result.success).toBe(true);
    expect(result.totalChemistry).toBeGreaterThanOrEqual(30);
    expect(result.totalCost).toBeGreaterThan(245000);
    expect(result.totalCost).toBeLessThanOrEqual(500000);
    expect(result.squad.filter(player => player.isLocked).every(player => player.price === 0)).toBe(true);
    expect(new Set(result.squad.map(player => player.playerKey)).size).toBe(11);
  });
  it('selects a premium winger after reserving the striker identity', async () => {
    const base = createSquadCandidateRows().filter(row => (row.id - 1) % 3 === 0);
    const slots = FORMATIONS.find(item => item.name === '4-3-3')!.slots;
    const currentSquad = Object.fromEntries(slots.slice(2).map((slot, i) => [slot.position, { card: base[i + 2], isLocked: true }]));
    const makeWinger = (id: number, playerId: number, price: number, score: number) => ({ ...base[0], id, player_id: playerId, price,
      player_stats: { pac: score, sho: score, dri: score, phy: score, composure: score } });
    // These high-meta versions conflict with the sole ST and exhaust the first DFS.
    const blocked = Array.from({ length: 400 }, (_, i) => makeWinger(1000 + i, base[1].player_id, 2000, 99));
    const cheap = makeWinger(2000, 2000, 650, 50);
    const upgrade = makeWinger(2001, 2001, 150000, 95);
    const result = await generateOptimalSquad('4-3-3', groups([...base.slice(1), ...blocked, cheap, upgrade]), 1000000, 30, false, {
      currentSquad,
    });
    expect(result.totalCost).toBeLessThanOrEqual(1000000);
    expect(result.success).toBe(true);
    expect(result.squad.find(player => player.slotPosition === 'LW')?.id).toBe('2001');
  });
  it('selects stronger cards above soft targets instead of a 650-coin card, preserving locks and input budgets', async () => {
    const rows = createSquadCandidateRows().map(row => ({ ...row, price: (row.id - 1) % 3 === 0 ? 650 : (row.id - 1) % 3 === 1 ? 150000 : 200000 }));
    const slots = FORMATIONS.find(item => item.name === '4-3-3')!.slots;
    const goalkeeper = rows.find(row => row.card_positions[0].positions.name === 'GK' && row.price === 200000)!;
    const options = { currentSquad: { GK: { card: goalkeeper, isLocked: true } } };
    const before = structuredClone(options);
    for (const candidateRows of [rows, [...rows].reverse()]) {
      const result = await generateOptimalSquad('4-3-3', groups(candidateRows), 2000000, 30, false, options);
      expect(result.success).toBe(true);
      expect(result.totalChemistry).toBeGreaterThanOrEqual(30);
      expect(result.squad.find(player => player.slotPosition === 'GK')?.id).toBe(String(goalkeeper.id));
      expect(result.squad.some(player => !player.isLocked && player.price > 166000)).toBe(true);
      expect(result.totalCost).toBeGreaterThanOrEqual(1700000);
      expect(result.totalCost).toBeLessThanOrEqual(2000000);
    }
    expect(options).toEqual(before);
  });

  it('places the shared player at striker before choosing a winger', async () => {
    const base = createSquadCandidateRows().filter(row => (row.id - 1) % 3 === 0);
    const slots = FORMATIONS.find(item => item.name === '4-3-3')!.slots;
    const currentSquad = Object.fromEntries(slots.slice(2).map((slot, i) => [slot.position, { card: base[i + 2], isLocked: true }]));
    const make = (row: typeof base[number], id: number, score: number) => ({ ...row, id, player_id: id, price: 100000,
      player_stats: { pac: score, sho: score, dri: score, phy: score, composure: score } });
    const shared = { ...make(base[0], 900, 95), card_positions: [
      { is_primary: true, positions: { name: 'LW' } }, { is_primary: false, positions: { name: 'ST' } },
    ] };
    const winger = make(base[0], 901, 80);
    const striker = { ...make(base[1], 902, 50), price: 650 };
    const result = await generateOptimalSquad('4-3-3', groups([...base.slice(2), shared, winger, striker]), 1000000, 30, false, {
      currentSquad,
    });
    expect(result.success).toBe(true);
    expect(result.squad.find(player => player.slotPosition === 'LW')?.id).toBe('901');
    expect(result.squad.find(player => player.slotPosition === 'ST')?.id).toBe('900');
    expect(result.squad.filter(player => player.isLocked).map(player => player.id)).toEqual(base.slice(2).map(row => String(row.id)));
  });

  it('uses the new OVR-and-pace formula instead of persisted meta_score', async () => {
    const rows = createSquadCandidateRows().map(row => {
      if (row.card_positions[0].positions.name !== 'ST') return row;
      const fast = (row.id - 1) % 3 === 0;
      const stat = fast ? 70 : 80;
      return { ...row, price: 30000, overall: fast ? 70 : 99, meta_score: fast ? 0 : 999,
        face_stats: { pac: fast ? 91 : 80, sho: stat, dri: stat, phy: stat },
        detail_stats: { composure: stat } };
    });
    const result = await generateOptimalSquad('4-3-3', groups(rows), 0, 0, false);
    expect(result.success).toBe(true);
    const striker = result.squad.find(player => player.slotPosition === 'ST');
    expect(striker?.card.overall).toBe(99);
    expect(striker?.card.meta_score).toBe(999);
    expect(striker?.metaScore).toBeCloseTo(99 * 1.5 + 80 * .5);
  });

  it('selects male CB candidates using the joined gender bonus in both CB slots', async () => {
    const rows = createSquadCandidateRows().map(row => {
      if (row.card_positions[0].positions.name !== 'CB') return row;
      const male = (row.id - 1) % 3 === 0;
      const score = male ? 80 : 82;
      return { ...row, price: 30000, players: { ...row.players, gender: male ? 'Male' : 'Female' },
        player_stats: { pac: score, def: score, phy: score } };
    });
    const result = await generateOptimalSquad('4-3-3', groups(rows), 0, 0, false);
    expect(result.success).toBe(true);
    const defenders = result.squad.filter(player => ['LCB', 'RCB'].includes(player.slotPosition));
    expect(defenders).toHaveLength(2);
    expect(defenders.every(player => player.card.players.gender === 'Male')).toBe(true);
    defenders.forEach(player => expect(player.metaScore).toBeCloseTo(calculatePlayerStrength(player)));
  });

  it('excludes only the banned card through candidates, ownership and fallback', async () => {
    const rows = createSquadCandidateRows();
    const versions = rows.filter(row => row.card_positions[0].positions.name === 'LW');
    versions.forEach(row => { row.player_id = 999; });
    const banned = versions[2];
    for (const budget of [0, 1]) {
      const result = await generateOptimalSquad('4-3-3', groups(rows), budget, 0, false, {
        excludedCardVersionIds: [String(banned.id)], currentSquad: { LW: { card: { raw: banned }, isOwned: true } },
      });
      expect(result.squad).toHaveLength(budget === 0 ? 11 : 0);
      expect(result.squad.every(player => player.id !== String(banned.id))).toBe(true);
      if (budget === 0) expect(result.squad.find(player => player.slotPosition === 'LW')?.playerKey).toBe('999');
      expect(result.status).toBe(budget === 0 ? 'success' : 'incomplete');
    }
    await expect(generateOptimalSquad('4-3-3', groups(rows), 0, 0, false, {
      excludedCardVersionIds: [banned.id], currentSquad: { LW: { card: banned, isLocked: true } },
    })).rejects.toThrow('An excluded card is locked in your squad');
    const lockedAlternative = await generateOptimalSquad('4-3-3', groups(rows), 0, 0, false, {
      excludedCardVersionIds: [banned.id], currentSquad: { LW: { card: versions[0], isLocked: true } },
    });
    expect(lockedAlternative.success).toBe(true);
    expect(lockedAlternative.squad.find(player => player.slotPosition === 'LW')?.id).toBe(String(versions[0].id));
  });

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
    const result = await generateOptimalSquad('4-3-3', groups([...isolated, ...linked]), 20000, 33, false);
    expect(result.status).toBe('success');
    expect(result.totalChemistry).toBe(33);
    expect(result.totalCost).toBeLessThanOrEqual(12100);
    expect(result.squad).toHaveLength(11);
    expect(new Set(result.squad.map(p => p.playerKey)).size).toBe(11);
    expect(result.iterations).toBeLessThanOrEqual(10000);
  });
  it('builds all exact slots using meta rather than OVR, honors budget, and preserves inputs', async () => {
    const candidates = groups();
    const snapshot = structuredClone(candidates);
    const result = await generateOptimalSquad('4-3-3', candidates, 1000000, 33, true);
    expect(result.success).toBe(true);
    expect(result.squad.map(p => p.slotPosition)).toEqual(['LW', 'ST', 'RW', 'LCM', 'CM', 'RCM', 'LB', 'LCB', 'RCB', 'RB', 'GK']);
    expect(result.squad.filter(p => !['LB', 'RB', 'GK'].includes(p.slotPosition)).every(p => p.card.overall === 97)).toBe(true);
    expect(result.totalCost).toBe(900000);
    expect(new Set(result.squad.map(p => p.playerKey)).size).toBe(11);
    expect(calculateSquadChemistry(result.squad, true).totalChemistry).toBe(result.totalChemistry);
    // GK uses OVR; attackers use the missing-composure fallback of 75.
    expect(result.squad.find(player => player.slotPosition === 'GK')?.metaScore).toBe(calculatePlayerStrength(result.squad.find(player => player.slotPosition === 'GK')));
    expect(result.teamMetaScore).toBeCloseTo(result.squad.reduce((sum, p) => sum + calculatePlayerStrength(p), 0) / 11);
    expect(result.iterations).toBeLessThanOrEqual(10000);
    expect(candidates).toEqual(snapshot);
  });

  it('reserves budget and disables managers', async () => {
    const result = await generateOptimalSquad('4-3-3', groups(createSquadCandidateRows().filter(row => (row.id - 1) % 3 === 0)), 500000, 33, false);
    expect(result.success).toBe(true);
    expect(result.totalCost).toBe(286750);
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
    expect(impossible.status).toBe('incomplete');
    expect(impossible.squad).toHaveLength(0);
    expect(impossible.totalCost).toBeLessThanOrEqual(1);
    expect(impossible.iterations).toBeLessThanOrEqual(10000);
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
