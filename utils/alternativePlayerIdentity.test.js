import { expect, test } from 'vitest';
import { getSwapPlayerId, assertUniqueSwapPlayer, suggestAlternativePlayers, suggestAlternativePlayersAsync } from './alternativePlayers.js';

const card = (id, extra = {}) => ({ id, position: 'CM', overall: 85, price: 100,
  nation_id: 1, league_id: 1, club_id: 1, ...extra });
const squad = {
  LB: { card: card('brugts-gold', { player_id: 42, position: 'LB' }) },
  RCM: { card: card('current-gold', { player_id: 99 }) },
};

test.each([
  { player_id: '42' }, { playerId: 42 }, { player: { id: 42 } },
  { players: [{ id: 42 }] }, { raw: { player_id: 42 } }, { raw: { players: { id: 42 } } },
])('normalizes person identity from supported card shapes: %j', identity => {
  expect(getSwapPlayerId(card('other-version', identity))).toBe('42');
});

test('all recommendation paths exclude another version of an occupied player, but allow replacing the target person', async () => {
  const candidates = [card('brugts-special', { raw: { player_id: '42' } }),
    card('current-special', { playerId: '99' }), card('different-person', { player_id: 100 })];
  for (const run of [suggestAlternativePlayers, suggestAlternativePlayersAsync]) {
    const result = await run({ squad, targetPosition: 'RCM', candidates, minChemistryTarget: 0 });
    expect(result.map(row => row.card.id).sort()).toEqual(['current-special', 'different-person']);
  }
});

test('selection guard rechecks the live squad and never confuses a card ID with a player ID', () => {
  const live = { RCM: squad.RCM };
  const selected = card('special', { player_id: 42 });
  expect(() => assertUniqueSwapPlayer(live, 'RCM', selected)).not.toThrow();
  live.LB = squad.LB;
  expect(() => assertUniqueSwapPlayer(live, 'RCM', selected)).toThrow('already in another squad slot');
  expect(() => assertUniqueSwapPlayer(live, 'RCM', card('target-version', { player_id: 99 }))).not.toThrow();
  expect(getSwapPlayerId({ id: 42 })).toBeNull();
  expect(() => assertUniqueSwapPlayer(live, 'RCM', { id: 42, player_id: 100 })).not.toThrow();
});
