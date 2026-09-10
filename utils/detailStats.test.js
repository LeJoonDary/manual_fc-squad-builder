import { test, expect } from 'vitest';
import { detailStatGroups } from './detailStats.js';
test('outfield players show six categories without goalkeeper stats', () => {
  const groups = detailStatGroups({ primary_position: 'ST', raw: { player_stats: { acceleration: 97, gk_diving: 10 } } });
  expect(groups).toHaveLength(6);
  expect(groups.flatMap(g => g.stats).some(s => s.key.startsWith('gk_'))).toBe(false);
  expect(groups[0].stats.find(s => s.key === 'acceleration').value).toBe(97);
});
test('primary GK shows only five keeper stats and retains zero values', () => {
  const groups = detailStatGroups({ primary_position: 'GK', raw: { player_stats: [{ gk_diving: 90, gk_handling: 0, pac: 40 }] } });
  expect(groups).toHaveLength(1);
  expect(groups[0].group).toBe('GOALKEEPING');
  expect(groups[0].stats).toHaveLength(5);
  expect(groups[0].stats[1].value).toBe(0);
  expect(groups[0].stats[2].value).toBe(null);
});
