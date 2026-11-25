import { expect, test } from 'vitest';
import { STAT_KEYS, defaultStats, applyStatQuery, activeStats, matchesDetailedStats } from './statFilters.js';
import { AUTO_BUILD_CANDIDATE_SELECT } from './autoBuildUtils';
import { PLAYER_LIST_SELECT } from './playerCatalog.js';

test('all 40 query columns match the supplied player_stats schema', () => {
  const expected = 'pac sho pas dri def phy acceleration sprint_speed positioning finishing shot_power long_shots volleys penalties vision crossing fk_accuracy short_passing long_passing curve agility balance reactions ball_control dribbling composure interceptions heading_accuracy def_awareness standing_tackle sliding_tackle jumping stamina strength aggression gk_diving gk_handling gk_kicking gk_positioning gk_reflexes'.split(' ');
  expect([...STAT_KEYS].sort()).toEqual([...expected].sort());
  const full = AUTO_BUILD_CANDIDATE_SELECT.match(/player_stats\(([^)]+)\)/)[1].split(',').map(key => key.trim());
  expect([...full].sort()).toEqual([...expected].sort());
  const summary = PLAYER_LIST_SELECT.match(/player_stats\(([^)]+)\)/)[1].split(',').map(key => key.trim());
  expect(summary.every(key => expected.includes(key))).toBe(true);
});

test('sparse slot stats require every inclusive bound and reject missing values', () => {
  const requirement = { finishing: { min: 88 }, composure: { min: 85, max: 99 }, gk_diving: { min: 0 } };
  const stats = { finishing: 88, composure: 85, gk_diving: 0 };
  expect(activeStats(requirement)).toEqual(['finishing', 'composure', 'gk_diving']);
  for (const card of [{ player_stats: stats }, { raw: { player_stats: [stats] } }, { card: { player_stats: stats } }]) expect(matchesDetailedStats(card, requirement)).toBe(true);
  for (const values of [{ ...stats, finishing: 87 }, { ...stats, composure: 84 }, { ...stats, composure: 100 }, { ...stats, gk_diving: null }]) expect(matchesDetailedStats({ player_stats: values }, requirement)).toBe(false);
  expect(matchesDetailedStats({}, {})).toBe(true);
});
test('defaults do not filter out missing optional goalkeeper stats', () => {
  expect(STAT_KEYS).toHaveLength(40);
  expect(new Set(STAT_KEYS).size).toBe(40);
  expect(activeStats(defaultStats())).toEqual([]);
  expect(applyStatQuery({}, defaultStats())).toEqual({});
});
test('uses exact joined columns and inclusive minimum and maximum filters', () => {
  const calls = [];
  const query = { gte: (...args) => { calls.push(['gte', ...args]); return query; }, lte: (...args) => { calls.push(['lte', ...args]); return query; } };
  const stats = defaultStats();
  stats.acceleration = { min: 85, max: 99 };
  stats.dribbling = { min: 0, max: 80 };
  applyStatQuery(query, stats);
  expect(calls).toEqual([
    ['gte', 'player_stats.acceleration', 85], ['lte', 'player_stats.acceleration', 99],
    ['gte', 'player_stats.dribbling', 0], ['lte', 'player_stats.dribbling', 80],
  ]);
});
