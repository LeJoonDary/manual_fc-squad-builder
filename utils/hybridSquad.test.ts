
import { expect, it } from 'vitest';
import { generateOptimalSquad, withinLeagueLimit, clubSynergyBonus, getPositionBudgetGroup, type CandidateGroups } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';
const slots = FORMATIONS.find(f => f.name === '4-3-3')!.slots;
const make = (id: number, position: string, leagueId: number, clubId: number, score = 85, price = 1000) => ({
  id, player_id: id, position, leagueId, clubId, nationId: 1, overall: 85, price,
  face_stats: { pac: score, sho: score, pas: score, dri: score, def: score, phy: score },
});
function grouped(rows: ReturnType<typeof make>[]) {
  const groups: CandidateGroups = { FW: [], MF: [], DF: [] };
  for (const row of rows) groups[getPositionBudgetGroup(row.position, false)].push(row);
  return groups;
}
it('enforces six real league members and treats numeric/string IDs equally', () => {
  const six = Array.from({ length: 6 }, () => ({ leagueId: 100 }));
  expect(withinLeagueLimit(six)).toBe(true);
  expect(withinLeagueLimit([...six, { league_id: '100' }])).toBe(false);
  expect(withinLeagueLimit([...six, { leagueId: 200 }, { leagueId: 100, isIcon: true }])).toBe(true);
});
it.each([0, 1, 2, 3, 4])('awards club synergy only for resulting clusters of 2–4 (%s existing)', count => {
  expect(clubSynergyBonus({ clubId: '7' }, Array.from({ length: count }, () => ({ clubId: 7 })))).toBe(count >= 1 && count <= 3 ? 4 : 0);
  expect(clubSynergyBonus({}, [{}])).toBe(0);
});
it.each([1, 999])('builds a chemistry-valid hybrid regardless of league identity %s', async league => {
  const rows = slots.flatMap((slot, i) => [
    make(100 + i, slot.position, league, 1, 90),
    make(200 + i, slot.position, league + 1, 2, 88),
    make(300 + i, slot.position, league + 2, 3, 87),
  ]);
  for (const input of [rows, [...rows].reverse()]) {
    const result = await generateOptimalSquad('4-3-3', grouped(input), 1000000, 33, false);
    expect(result.success).toBe(true);
    expect(result.totalChemistry).toBe(33);
    expect(withinLeagueLimit(result.squad)).toBe(true);
    expect(new Set(result.squad.map(p => p.leagueId)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(result.squad.map(p => p.clubId)).size).toBeGreaterThanOrEqual(2);
  }
});
it('does not relax the league ceiling in fallback and rejects conflicting locks', async () => {
  const rows = slots.map((slot, i) => make(i, slot.position, 1, 1));
  const result = await generateOptimalSquad('4-3-3', grouped(rows), 1000000, 0, false);
  expect(result.success).toBe(false);
  expect(result.squad.length).toBeLessThanOrEqual(6);
  await expect(generateOptimalSquad('4-3-3', grouped(rows), 1000000, 0, false, {
    currentSquad: Object.fromEntries(slots.slice(0, 7).map((slot, i) => [slot.position, { card: rows[i], isLocked: true }])),
  })).rejects.toThrow('six-player league limit');
});
it('can select pace 81 and invest at least half the budget in attackers when feasible', async () => {
  const currentSquad = Object.fromEntries(slots.filter(slot => !['ST', 'LW', 'RW'].includes(slot.position))
    .map((slot, i) => [slot.position, { card: make(i, slot.position, 1 + i % 3, 1), isLocked: true, isOwned: true }]));
  const rows = [
    make(100, 'ST', 1, 1, 88, 1000), make(101, 'ST', 1, 1, 88, 400000),
    make(102, 'LW', 2, 1, 81, 100000), make(103, 'RW', 3, 1, 81, 100000),
  ];
  const result = await generateOptimalSquad('4-3-3', grouped(rows), 1000000, 33, false, { currentSquad });
  expect(result.success).toBe(true);
  expect(result.totalCost).toBeGreaterThanOrEqual(500000);
  expect(result.squad.find(p => p.slotPosition === 'LW')?.card.face_stats.pac).toBe(81);
  expect(result.squad.filter(p => p.isLocked)).toHaveLength(8);
});
