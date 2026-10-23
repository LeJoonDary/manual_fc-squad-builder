import { expect, test } from 'vitest';
import { sharedClubKey } from './clubIdentity';
import { adaptChemistryPlayerCard, calculateChemistry } from './chemistry';
import { clubSynergyBonus, evaluateSquadBalance, isStrictSelectionValid } from './autoBuildUtils';

test.each(['Manchester Utd', 'Arsenal', 'Chelsea', 'Barcelona', '새로운 클럽'])('pools all name shapes for %s', name => {
  const expected = sharedClubKey({ club: { name } });
  for (const shape of [{ clubs: [{ name }] }, { club: [{ name }] }, { club_name: ` ${name.toUpperCase()} ` },
    { clubName: name }, { club: name }, { card: { clubs: { name } } }]) {
    expect(sharedClubKey({ club_id: 48, ...shape })).toBe(expected);
  }
});

test.each([[2, 1], [4, 2], [7, 3]])('%i mixed-league club members receive %i club chemistry each', (count, score) => {
  const players = Array.from({ length: count }, (_, id) => adaptChemistryPlayerCard({
    id, position: 'ST', club_id: id % 2 ? 48 : 10,
    club: { name: id % 2 ? '  MANCHESTER   UTD ' : 'Manchester Utd' },
    league_id: id + 100, nation_id: id + 200,
  }));
  const result = calculateChemistry(players.map(player => ({ position: 'ST', player })));
  expect(result.groupCounts.club).toEqual({ 'club:shared:manchester utd': count });
  expect(Object.values(result.playerChemMap)).toEqual(Array(count).fill(score));
  expect(result.totalChemistry).toBe(count * score);
  expect(Object.keys(result.groupCounts.league)).toHaveLength(count);
  const misplaced = calculateChemistry(players.map((player, i) => ({ position: i ? 'ST' : 'GK', player })));
  expect(misplaced.groupCounts.club['club:shared:manchester utd']).toBe(count - 1);
  expect(misplaced.playerChemMap['0']).toBe(0);
});

test('builder links and quotas prioritize names over differing database IDs', () => {
  const players = Array.from({ length: 5 }, (_, id) => ({ id: String(id), clubId: id,
    club: { name: 'Manchester Utd' }, leagueId: id, nationId: id }));
  expect(evaluateSquadBalance(players.slice(0, 2))).toBe(40);
  expect(clubSynergyBonus(players[0], [players[1]])).toBeGreaterThan(0);
  expect(isStrictSelectionValid(players)).toBe(false);
});
