import { expect, it } from 'vitest';
import { fetchCandidatePlayers, generateOptimalSquad, isCardIcon, isCardHero } from './autoBuildUtils';
import { createSquadCandidateRows } from '../scripts/mocks/squadCandidates.js';
import { createCandidateMockDb } from '../scripts/mocks/candidateDb.js';

it.each([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [null, null], [0, 5], [5, 0]])('enforces independent special limits %s / %s', async (maxIcons, maxHeroes) => {
  const rows = createSquadCandidateRows().map(row => ({ ...row, league_id: 100 + Math.floor((row.id - 1) / 12), club_id: 100 + Math.floor((row.id - 1) / 12), clubs: null, players: { ...row.players, nation_id: 100 + Math.floor((row.id - 1) / 12) }, player_stats: Object.fromEntries(Object.keys(row.player_stats).map(key => [key, 90])), candidateGroups: ['FW', 'MF', 'DF'] }));
  rows.forEach((row, index) => {
    if (index % 3 === 1) row.version = 'promo_icon';
    if (index % 3 === 2) row.version = 'promo_hero';
  });
  const result = await generateOptimalSquad('4-3-3', rows, 0, 0, false, { maxIcons, maxHeroes });
  expect(result.success).toBe(true);
  expect(result.squad.filter(isCardIcon).length).toBeLessThanOrEqual(maxIcons ?? 11);
  expect(result.squad.filter(isCardHero).length).toBeLessThanOrEqual(maxHeroes ?? 11);
});
it('excludes every icon identity and heroes from fetched and owned candidates', async () => {
  const rows = createSquadCandidateRows().map(row => ({ ...row, league_id: 100 + Math.floor((row.id - 1) / 12), club_id: 100 + Math.floor((row.id - 1) / 12), clubs: null, players: { ...row.players, nation_id: 100 + Math.floor((row.id - 1) / 12) }, player_stats: Object.fromEntries(Object.keys(row.player_stats).map(key => [key, 90])), candidateGroups: ['FW', 'MF', 'DF'] }));
  Object.assign(rows[0], { league_id: 2118 });
  Object.assign(rows[1], { club_id: 112658 });
  Object.assign(rows[2], { card_type: 'ICON' });
  Object.assign(rows[3], { version: 'promo_icon' });
  Object.assign(rows[4], { card_type: 'HERO' });
  Object.assign(rows[5], { version: 'promo_hero' });
  const candidates = await fetchCandidatePlayers(0, '4-3-3', false, createCandidateMockDb(rows) as any,
    { maxIcons: 0, maxHeroes: 0, currentSquad: { LW: { card: rows[0], isOwned: true } } });
  expect(candidates.length).toBeGreaterThan(0);
  expect(candidates.some(card => isCardIcon(card) || isCardHero(card))).toBe(false);
});
it.each([['ICON', 0], ['ICON', 1], ['HERO', 0], ['HERO', 1]])('ignores three locked %s cards with an auto-fill limit of %s', async (card_type, limit) => {
  const rows = createSquadCandidateRows().map(row => ({ ...row, league_id: 100 + Math.floor((row.id - 1) / 12), club_id: 100 + Math.floor((row.id - 1) / 12), clubs: null, players: { ...row.players, nation_id: 100 + Math.floor((row.id - 1) / 12) }, player_stats: Object.fromEntries(Object.keys(row.player_stats).map(key => [key, 90])), candidateGroups: ['FW', 'MF', 'DF'] }));
  const currentSquad = Object.fromEntries(['LW', 'ST', 'RW'].map((slot, index) =>
    [slot, { card: { ...rows[index * 3], card_type }, isLocked: true }]));
  rows.forEach((row, index) => { if (index % 3 === 2) row.card_type = card_type; });
  const options = { currentSquad, maxIcons: limit, maxHeroes: limit, maxSpecialCards: limit };
  const candidates = await fetchCandidatePlayers(0, '4-3-3', false, createCandidateMockDb(rows) as any, options);
  const result = await generateOptimalSquad('4-3-3', candidates, 0, 0, false, options);
  expect(result.success).toBe(true);
  expect(result.squad.filter(p => p.isLocked)).toHaveLength(3);
  const isSpecial = card_type === 'ICON' ? isCardIcon : isCardHero;
  expect(result.squad.filter(p => p.isLocked && isSpecial(p))).toHaveLength(3);
  expect(result.squad.filter(p => !p.isLocked && isSpecial(p)).length).toBeLessThanOrEqual(limit);
});
