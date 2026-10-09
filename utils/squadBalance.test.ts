import { expect, test } from 'vitest';
import { evaluateSquadBalance, defensiveMetaPenalty, generateOptimalSquad } from './autoBuildUtils';
import { adaptChemistryPlayerCard, calculateChemistry } from './chemistry';
import { sharedClubKey } from './clubIdentity';
import { FORMATIONS } from './formations.js';

test.each([1, 2, 3, 4, 5, 6, 7, 8, 11])('nation and league soft penalties at %s members', count => {
  const penalty = count >= 6 ? -300 : 0;
  expect(evaluateSquadBalance(Array.from({ length: count }, () => ({ nation_id: 1 })))).toBe(penalty);
  expect(evaluateSquadBalance(Array.from({ length: count }, () => ({ league_id: 1 })))).toBe(penalty);
});
test.each([[4, 4, 3], [5, 4, 2], [5, 3, 3]])('exact hybrid %s/%s/%s adds 150', (...pattern) => {
  const players = pattern.flatMap((count, index) => Array.from({ length: count }, () => ({ leagueId: index })));
  expect(evaluateSquadBalance(players)).toBe(150);
});
test.each([['Real Madrid', 'real-madrid-femenino'], ['FC Barcelona', 'FC Barcelona Femení'],
  ['Arsenal', 'Arsenal Women'], ['Chelsea FC', 'Chelsea Ladies'], ['Man City', "Manchester City Women's"]])('unifies club chemistry for %s / %s', (men, women) => {
  const cards = [men, women].map((name, i) => adaptChemistryPlayerCard({ id: i, position: 'CM', club_id: i + 1,
    clubs: { name }, league_id: i + 10, nation_id: i + 20 }));
  expect(cards[0].clubId).toBe(cards[1].clubId);
  const result = calculateChemistry(cards.map(player => ({ position: 'CM', player })), null);
  expect(result.totalChemistry).toBe(2);
  expect(evaluateSquadBalance(cards)).toBe(40);
});
test('unknown and missing club names do not merge unrelated IDs', () => {
  expect(sharedClubKey({ club: 'Unknown FC' })).toBe('');
  expect(adaptChemistryPlayerCard({ club_id: 1 }).clubId).not.toBe(adaptChemistryPlayerCard({ club_id: 2 }).clubId);
});
test.each([['LCB', 179, -250], ['RCB', 180, 0], ['GK', 185, -250], ['GK', 186, 0], ['ST', 160, 0]])('defensive height floor for %s at %s', (position, height, expected) => {
  expect(defensiveMetaPenalty({ players: [{ height }] }, String(position))).toBe(expected);
  expect(defensiveMetaPenalty({ players: [{ height, gender: 'Female' }] }, String(position), true)).toBe(0);
});
test('female penalty is applied once and missing height is not treated as short', () => {
  expect(defensiveMetaPenalty({ gender: 'female', height: 170 }, 'CB')).toBe(-250);
  expect(defensiveMetaPenalty({ raw: { players: { gender: 'Female', height: 190 } } }, 'GK')).toBe(-250);
  expect(defensiveMetaPenalty({}, 'CB')).toBe(0);
});
test('builder selects the taller unlocked CB but preserves a manually locked short CB', async () => {
  const slots = FORMATIONS.find(f => f.name === '4-3-3')!.slots;
  const make = (id, position, height) => ({ id, player_id: id, position, height, overall: 90, price: 1000,
    nationId: 1, leagueId: 1 + id % 3, clubId: 1, face_stats: { pac: 90, sho: 90, pas: 90, dri: 90, def: 90, phy: 90 } });
  const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'LCB').map((slot, i) => [slot.position,
    { card: make(i + 1, slot.position, 190), isLocked: true, isOwned: true }]));
  const short = make(100, 'CB', 179), tall = make(103, 'CB', 190);
  const result = await generateOptimalSquad('4-3-3', { FW: [], MF: [], DF: [short, tall] }, 1000000, 0, false, { currentSquad });
  expect(result.squad.find(p => p.slotPosition === 'LCB')?.id).toBe('103');
  currentSquad.LCB = { card: short, isLocked: true, isOwned: true };
  const locked = await generateOptimalSquad('4-3-3', { FW: [], MF: [], DF: [tall] }, 1000000, 0, false, { currentSquad });
  expect(locked.squad.find(p => p.slotPosition === 'LCB')?.id).toBe('100');
});
