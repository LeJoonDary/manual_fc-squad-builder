import { expect, it } from 'vitest';
import { isFemaleCandidate, withinFemaleLimit, fetchCandidatePlayers, generateOptimalSquad, upgradeSquadToTargetBudgetRatio } from './autoBuildUtils';
import { createExcludedCardVersionsStore } from './excludedCardVersions.js';
import { createSquadCandidateRows } from '../scripts/mocks/squadCandidates.js';
import { createCandidateMockDb } from '../scripts/mocks/candidateDb.js';

it.each([["Men's Football", false], ['male', false], ["Women's Football", true], ['FEMALE', true], ['', false]])('classifies %s', (gender, female) => {
  for (const card of [{ players: { gender } }, { players: [{ gender }] }, { player: { gender } }, { gender }, { raw: { players: { gender } } }]) {
    expect(isFemaleCandidate(card)).toBe(female);
  }
});

it('validates and clears female limits in memory and starts fresh after reload', () => {
  let saved = JSON.stringify({ genderFilter: 'men', maxIcons: 0, maxHeroes: 2 });
  const storage = () => ({ getItem: () => saved, setItem: (_key, value) => { saved = value; } });
  const store = createExcludedCardVersionsStore(storage);
  expect(store.getState()).toMatchObject({ maxFemalePlayers: 'any', maxIcons: null, maxHeroes: null });
  for (const value of ['exclude', 1, 2, 3, 4, 5, 'any']) {
    store.setMaxFemalePlayers(value);
    expect(store.getState().maxFemalePlayers).toBe(value);
    expect(createExcludedCardVersionsStore(storage).getState().maxFemalePlayers).toBe('any');
  }
  expect(() => store.setMaxFemalePlayers(6)).toThrow();
  store.setMaxFemalePlayers(1);
  store.clear();
  expect(store.getState().maxFemalePlayers).toBe('any');
  store.setMaxFemalePlayers(2);
  store.reset();
  expect(store.getState().maxFemalePlayers).toBe('any');
});

const rows = () => ['male', 'female'].flatMap((gender, group) => createSquadCandidateRows().filter((_, i) => i % 3 === 0).map(row => ({
  ...row, price: 1000, id: row.id + group * 100, player_id: row.id + group * 100,
  players: { ...row.players, id: row.id + group * 100, gender, nation_id: 100 + Math.floor((row.id - 1) / 12) },
  club_id: 100 + Math.floor((row.id - 1) / 12), league_id: 100 + Math.floor((row.id - 1) / 12),
  player_stats: Object.fromEntries(Object.keys(row.player_stats).map(key => [key, 90 + group])),
  candidateGroups: ['FW', 'MF', 'DF'],
})));

it('filters Exclude before top-N and prevents owned women re-entering the pool', async () => {
  const male = rows()[0], female = rows()[11];
  const db = createCandidateMockDb([...Array.from({ length: 350 }, (_, i) => ({ ...female, id: 1000 + i })), { ...male, overall: 85 }]);
  const candidates = await fetchCandidatePlayers(1000000, '4-3-3', false, db as any, {
    maxFemalePlayers: 'exclude', currentSquad: { LW: { card: female, isOwned: true } },
  });
  expect(candidates.map(card => card.id)).toEqual([male.id]);
  expect(db.calls.every(call => call.genderOr)).toBe(true);
});

it.each(['exclude', 1, 2, 3, 4, 5, 'any'] as const)('enforces %s automatic women with one locked woman', async maxFemalePlayers => {
  const pool = rows();
  const locked = pool[11];
  const options = { maxFemalePlayers, currentSquad: { LW: { card: locked, isLocked: true } } };
  const result = await generateOptimalSquad('4-3-3', pool, 1000000, 33, true, options);
  expect(result.success).toBe(true);
  expect(result.totalChemistry).toBe(33);
  expect(result.squad.find(p => p.isLocked)?.card.id).toBe(locked.id);
  const automatic = result.squad.filter(p => !p.isLocked && isFemaleCandidate(p));
  expect(automatic.length).toBeLessThanOrEqual(maxFemalePlayers === 'any' ? 10 : maxFemalePlayers === 'exclude' ? 0 : maxFemalePlayers);
  if (typeof maxFemalePlayers === 'number') {
    const lockedWomen = Array.from({ length: 3 }, () => ({ gender: 'female', isLocked: true }));
    const women = Array.from({ length: maxFemalePlayers }, () => ({ gender: 'female' }));
    expect(withinFemaleLimit([...lockedWomen, ...women], options)).toBe(true);
    expect(withinFemaleLimit([...lockedWomen, ...women, { gender: 'female' }], options)).toBe(false);
  }
});

it('prevents an upgrade from exceeding the female quota, but permits a female-for-female swap', async () => {
  const built = await generateOptimalSquad('4-3-3', rows().filter(p => !isFemaleCandidate(p)), 1000000, 33, true);
  expect(built.success).toBe(true);
  const current = structuredClone(built.squad);
  const winger = current.find(p => p.slotPosition === 'LW')!;
  winger.card.players.gender = 'female';
  const striker = current.find(p => p.slotPosition === 'ST')!;
  const candidate = { ...striker, id: '9999', playerKey: '9999', metaScore: 999,
    card: { ...striker.card, id: 9999, player_id: 9999, overall: 99,
      players: { ...striker.card.players, gender: "Women's Football" },
      player_stats: Object.fromEntries(Object.keys(striker.card.player_stats).map(key => [key, 99])) } };
  const pool = { ST: [candidate] };
  expect(upgradeSquadToTargetBudgetRatio(current, 1000000, pool, true, { maxFemalePlayers: 'any' }).some(p => p.id === '9999')).toBe(true);
  expect(upgradeSquadToTargetBudgetRatio(current, 1000000, pool, true, { maxFemalePlayers: 1 }).some(p => p.id === '9999')).toBe(false);
  winger.card.players.gender = 'male';
  striker.card.players.gender = 'female';
  expect(upgradeSquadToTargetBudgetRatio(current, 1000000, pool, true, { maxFemalePlayers: 1 }).some(p => p.id === '9999')).toBe(true);
});
