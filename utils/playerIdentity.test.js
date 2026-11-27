// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { getPlayerUniqueKey, isSamePlayer, hasDuplicatePitchPlayer } from './playerIdentity.js';
import { createPlayerCard } from '../components/PlayerCard.js';
import { createSavedEvosList } from '../components/SavedEvosList.js';
import { savedEvosStore, SAVED_EVOS_KEY } from './savedEvos.js';
import { setLanguage } from '../src/i18n/languageStore';
import { getRecommendedPlayersForSlot, generateOptimalSquad } from './autoBuildUtils';
const card = (id, player_id = id) => ({ id, player_id, position: 'CM', primary_position: 'CM', overall: 90, price: 1000,
  pac: 90, sho: 90, pas: 90, dri: 90, def: 90, phy: 90, nationId: 'A', leagueId: 'A', clubId: 'A' });

test('person IDs take precedence; legacy versions use only card identity', () => {
  expect(getPlayerUniqueKey({ id: 1, player_id: 42, players: { id: 5 } })).toBe('42');
  expect(isSamePlayer(card(1, 42), card(2, '42'))).toBe(true);
  expect(isSamePlayer({ card_id: 1 }, card(1, 42))).toBe(true);
  expect(isSamePlayer({ id: 42 }, card(1, 42))).toBe(false);
  expect(isSamePlayer({ id: 1 }, { id: 2 })).toBe(false);
});
test('the target slot and an actual move origin are excluded from placement checks', () => {
  const squad = { CM: { card: card(1, 42) }, LCM: { card: card(2, 99) } };
  expect(hasDuplicatePitchPlayer(squad, 'CM', card(3, 42))).toBe(false);
  expect(hasDuplicatePitchPlayer(squad, 'RCM', card(3, 42))).toBe(true);
  expect(hasDuplicatePitchPlayer(squad, 'LCM', card(1, 42), 'CM')).toBe(false);
});
test('both recommendation modes exclude other-slot versions but admit target upgrades', async () => {
  const currentSquad = { CM: { card: card(1, 42) }, LCM: { card: card(2, 99) } };
  for (const mode of ['empty', 'replace']) {
    const rows = await getRecommendedPlayersForSlot(null, { formation: '4-3-3', slotPosition: 'CM', totalBudget: 0,
      currentSquad, mode, sort: 'meta_synergy' }, [card(3, 42), card(4, 99)]);
    expect(rows.map(row => row.card.id)).toEqual([3]);
  }
  await expect(generateOptimalSquad('4-3-3', [], 0, 0, false, { currentSquad: {
    CM: { card: card(1, 42), isLocked: true }, LCM: { card: card(2, 42), isLocked: true },
  } })).rejects.toThrow('same player');
});
test('disabled search cards block mouse and keyboard selection', () => {
  const activate = vi.fn();
  const node = createPlayerCard(card(1), { disabled: true, onActivate: activate, getCardName: () => 'Player',
    getCardRating: () => 90, getCardPosition: () => 'CM', unwrapRelation: v => v, affiliationCatalog: {} });
  node.click(); node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  expect(activate).not.toHaveBeenCalled();
  expect(node.getAttribute('aria-disabled')).toBe('true');
  expect(node.querySelector('.in-squad-badge').textContent).toBe('In Squad');
});
test('duplicate custom cards stay visible and their inline delete remains available', () => {
  setLanguage('en', false);
  localStorage.setItem(SAVED_EVOS_KEY, JSON.stringify([{ id: '1', player: card(1, 42), customOverrides: { overall: 95 }, savedAt: 1 }]));
  savedEvosStore.load();
  const select = vi.fn();
  const list = createSavedEvosList({ position: 'CM', unavailable: () => true, select });
  expect(list.querySelector('.saved-evo-select').disabled).toBe(true);
  expect(list.querySelector('.in-squad-badge').textContent).toBe('In Squad');
  list.querySelector('.saved-evo-select').click();
  list.querySelector('.saved-evo-delete').click();
  list.querySelector('.saved-evo-delete-yes').click();
  expect(savedEvosStore.entries).toHaveLength(0);
  expect(select).not.toHaveBeenCalled();
});
