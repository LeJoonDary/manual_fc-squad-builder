import { expect, test } from 'vitest';
import { STAT_KEYS, defaultStats, applyStatQuery, activeStats } from './statFilters.js';
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
  stats.dribbling_sub = { min: 0, max: 80 };
  applyStatQuery(query, stats);
  expect(calls).toEqual([
    ['gte', 'player_stats.acceleration', 85], ['lte', 'player_stats.acceleration', 99],
    ['gte', 'player_stats.dribbling_sub', 0], ['lte', 'player_stats.dribbling_sub', 80],
  ]);
});
