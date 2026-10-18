import { expect, it } from 'vitest';
import { matchesGenderFilter, fetchCandidatePlayers, generateOptimalSquad } from './autoBuildUtils';
import { createExcludedCardVersionsStore } from './excludedCardVersions.js';
import { createSquadCandidateRows } from '../scripts/mocks/squadCandidates.js';
import { createCandidateMockDb } from '../scripts/mocks/candidateDb.js';

it.each([['Men\'s Football', 'men'], ['male', 'men'], ['Women\'s Football', 'women'], ['FEMALE', 'women'], ['', null]])('classifies %s without substring collisions', (gender, expected) => {
  for (const card of [{ players: { gender } }, { players: [{ gender }] }, { player: { gender } }, { gender }, { raw: { players: { gender } } }]) {
    expect(matchesGenderFilter(card, 'all')).toBe(true);
    expect(matchesGenderFilter(card, 'men')).toBe(expected === 'men');
    expect(matchesGenderFilter(card, 'women')).toBe(expected === 'women');
  }
});

it('persists gender and resets it while loading legacy settings as Any', () => {
  let saved = '{}';
  const storage = () => ({ getItem: () => saved, setItem: (_key, value) => { saved = value; } });
  const store = createExcludedCardVersionsStore(storage);
  expect(store.getState().genderFilter).toBe('all');
  store.setGenderFilter('women');
  store.ban('123');
  expect(createExcludedCardVersionsStore(storage).getState().genderFilter).toBe('women');
  store.reset();
  expect(store.getState().genderFilter).toBe('all');
});

const rows = () => ['male', 'female'].flatMap((gender, group) => createSquadCandidateRows().map(row => ({
  ...row, overall: row.overall - group, id: row.id + group * 100, player_id: row.id + group * 100,
  players: { ...row.players, id: row.id + group * 100, gender, nation_id: 100 + Math.floor((row.id - 1) / 12) },
  club_id: 100 + Math.floor((row.id - 1) / 12), league_id: 100 + Math.floor((row.id - 1) / 12),
  player_stats: Object.fromEntries(Object.keys(row.player_stats).map(key => [key, 90])),
  candidateGroups: ['FW', 'MF', 'DF'],
})));

it.each(['men', 'women'] as const)('filters %s before the database top-N limit', async genderFilter => {
  const wanted = rows().find(row => matchesGenderFilter(row, genderFilter))!;
  const other = rows().find(row => !matchesGenderFilter(row, genderFilter))!;
  const db = createCandidateMockDb([
    ...Array.from({ length: 350 }, (_, i) => ({ ...other, id: 1000 + i, overall: 99 })),
    { ...wanted, overall: 85 },
  ]);
  const candidates = await fetchCandidatePlayers(1000000, '4-3-3', false, db as any, { genderFilter });
  expect(candidates.map(card => card.id)).toEqual([wanted.id]);
  expect(db.calls.every(call => call.genderOr)).toBe(true);
});

it.each(['men', 'women', 'all'] as const)('builds a 33 chemistry squad with %s', async genderFilter => {
  const pool = genderFilter === 'all' ? rows().filter(row =>
    ['LW', 'ST', 'RW'].includes(row.card_positions[0].positions.name) === (row.players.gender === 'female')) : rows();
  const db = createCandidateMockDb(pool);
  const candidates = await fetchCandidatePlayers(1000000, '4-3-3', false, db as any, { genderFilter });
  expect(candidates.length).toBeGreaterThan(0);
  expect(candidates.every(card => matchesGenderFilter(card, genderFilter))).toBe(true);
  const result = await generateOptimalSquad('4-3-3', pool, 1000000, 33, true, { genderFilter });
  expect(result.success).toBe(true);
  expect(result.totalChemistry).toBe(33);
  expect(result.squad).toHaveLength(11);
  expect(result.squad.every(player => matchesGenderFilter(player.card, genderFilter))).toBe(true);
});

it('keeps an opposite-gender lock but filters unlocked owned cards', async () => {
  const cards = rows();
  const locked = cards.find(row => row.players.gender === 'female')!;
  const owned = cards.find(row => row.players.gender === 'female' && row.id !== locked.id)!;
  const options = { genderFilter: 'men' as const, currentSquad: { LW: { card: locked, isLocked: true }, ST: { card: owned, isOwned: true } } };
  const result = await generateOptimalSquad('4-3-3', cards, 1000000, 33, true, options);
  expect(result.success).toBe(true);
  expect(result.squad.find(player => player.isLocked)?.card.id).toBe(locked.id);
  expect(result.squad.filter(player => !player.isLocked).every(player => matchesGenderFilter(player.card, 'men'))).toBe(true);
});
