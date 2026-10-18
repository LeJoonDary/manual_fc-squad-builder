import { expect, it } from 'vitest';
import { calculateFinalSquadScore, generateOptimalSquad, getLeagueConstraints, isNewSelectionValid } from './autoBuildUtils';
import { createSquadCandidateRows } from '../scripts/mocks/squadCandidates.js';

const noSpecial = { maxIcons: 0, maxHeroes: 0 };
const quotaPlayers = (count: number) => Array.from({ length: count }, (_, i) => ({ leagueId: 100, nationId: i, clubId: i }));

it('relaxes only when both special types are excluded', () => {
  expect(getLeagueConstraints(noSpecial)).toEqual({ minLeagues: 2, maxLeagues: 3, maxPlayersPerLeague: 9 });
  for (const options of [{}, { maxIcons: 0 }, { maxHeroes: 0 }, { maxIcons: 0, maxHeroes: 1 }, { maxIcons: 1, maxHeroes: 0 }]) {
    expect(getLeagueConstraints(options).maxPlayersPerLeague).toBe(5);
    expect(isNewSelectionValid(quotaPlayers(6), options)).toBe(false);
  }
  expect(isNewSelectionValid(quotaPlayers(9), noSpecial)).toBe(true);
  expect(isNewSelectionValid(quotaPlayers(10), noSpecial)).toBe(false);
  expect(isNewSelectionValid(quotaPlayers(11), noSpecial)).toBe(false);
  expect(isNewSelectionValid(quotaPlayers(6).map(p => ({ ...p, nationId: 1 })), noSpecial)).toBe(false);
  expect(isNewSelectionValid(quotaPlayers(5).map(p => ({ ...p, clubId: 1 })), noSpecial)).toBe(false);
  expect(isNewSelectionValid(quotaPlayers(4).map((p, i) => ({ ...p, leagueId: i })), noSpecial)).toBe(false);
});

function candidates(coreSize: number) {
  return createSquadCandidateRows().filter((_, i) => i % 3 === 0).map((row, i) => ({
    ...row, price: 1000, overall: 90, league_id: i < coreSize ? 100 : 200,
    club_id: i < coreSize ? 100 + Math.floor(i / 3) : 200,
    players: { ...row.players, gender: 'male', nation_id: i < coreSize ? 100 + Math.floor(i / 3) : coreSize === 9 ? 100 : 200 },
    player_stats: Object.fromEntries(Object.keys(row.player_stats).map(key => [key, 90])),
    candidateGroups: ['FW', 'MF', 'DF'],
  }));
}

it.each([8, 9])('builds a %s-player core with two leagues and 33 chemistry under 100k', async coreSize => {
  const result = await generateOptimalSquad('4-3-3', candidates(coreSize), 100000, 33, true, noSpecial);
  expect(result.success).toBe(true);
  expect(result.totalChemistry).toBe(33);
  expect(result.totalCost).toBeLessThanOrEqual(100000);
  expect(result.squad).toHaveLength(11);
  expect(result.squad.filter(p => p.card.league_id === 100)).toHaveLength(coreSize);
  expect(Number.isFinite(calculateFinalSquadScore(result.squad, 33, 100000, false, 33, noSpecial))).toBe(true);
  expect(calculateFinalSquadScore(result.squad, 33, 100000)).toBe(-Infinity);
});

