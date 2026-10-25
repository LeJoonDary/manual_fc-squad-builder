import { expect, test, vi } from 'vitest';
import { createExcludedCardVersionsStore, EXCLUDED_CARD_VERSIONS_STORAGE_KEY, getCardVersionId, getExcludedCardManagementCount } from './excludedCardVersions.js';

function memoryStorage() {
  const data = new Map();
  return { data, getItem: vi.fn(key => data.get(key) ?? null), setItem: vi.fn((key, value) => data.set(key, value)), removeItem: vi.fn(key => data.delete(key)) };
}

test('reload starts empty, removes legacy keys, and neither reads nor writes persistence', () => {
  const storage = memoryStorage();
  storage.data.set(EXCLUDED_CARD_VERSIONS_STORAGE_KEY, JSON.stringify({ excludedCardVersionIds: ['123'], maxIcons: 0 }));
  storage.data.set('fc-squad-builder:excluded-players:v1', 'legacy');
  storage.data.set('unrelated-setting', 'keep');
  const store = createExcludedCardVersionsStore(() => storage);
  expect(getExcludedCardManagementCount(store.getState())).toBe(0);
  expect(storage.data.size).toBe(1);
  expect(storage.data.get('unrelated-setting')).toBe('keep');
  store.ban(123, 'Player');
  store.setMaxIcons(0);
  store.setMaxHeroes(2);
  store.setMaxFemalePlayers('exclude');
  store.setSquadOvrRange({ min: 75, max: 99 });
  const reloaded = createExcludedCardVersionsStore(() => storage);
  expect(reloaded.getState().excludedCardVersionIds).toEqual([]);
  expect(getExcludedCardManagementCount(reloaded.getState())).toBe(0);
  expect(store.getState().excludedCardVersionIds).toEqual(['123']);
  expect(storage.getItem).not.toHaveBeenCalled();
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('ban, deduplication, bulk removal and notifications work within the current page', () => {
  const store = createExcludedCardVersionsStore(() => undefined);
  const listener = vi.fn();
  const unsubscribe = store.subscribe(listener);
  store.ban(1, 'Player');
  store.ban('1', 'Duplicate');
  expect(listener).toHaveBeenCalledTimes(1);
  expect(store.banMany([1, '2', 2, 3])).toBe(2);
  expect(listener).toHaveBeenCalledTimes(2);
  expect(store.getState().excludedCardVersionNames['1']).toBe('Player');
  expect(store.banMany([2, 3])).toBe(0);
  store.unbanMany([1, '2', 2, 999]);
  expect(store.getState().excludedCardVersionIds).toEqual(['3']);
  expect(store.getState().excludedCardVersionNames).toEqual({ 3: 'Card 3' });
  store.clear();
  expect(getExcludedCardManagementCount(store.getState())).toBe(0);
  unsubscribe();
  store.ban(4);
  expect(listener).toHaveBeenCalledTimes(4);
});

test.each(['access', 'remove'])('blocked storage at %s never prevents edits', failure => {
  const store = createExcludedCardVersionsStore(() => {
    if (failure === 'access') throw new Error('blocked');
    return { removeItem: () => { throw new Error('blocked'); } };
  });
  store.ban(1, 'Player');
  expect(store.getState().excludedCardVersionIds).toEqual(['1']);
  store.unban(1);
  expect(store.getState().excludedCardVersionIds).toEqual([]);
});

test('invalid IDs and limits are rejected; settings remain independent until reset', () => {
  const store = createExcludedCardVersionsStore(() => undefined);
  expect(() => store.ban('2),id.gt.0')).toThrow('Card version ID');
  expect(() => store.setMaxIcons(6)).toThrow(RangeError);
  expect(() => store.setSquadOvrRange({ min: 90, max: 70 })).toThrow();
  store.setSquadOvrRange({ min: 75, max: 99 });
  store.setMaxHeroes(2);
  store.ban(123);
  store.clear();
  expect(store.getState()).toMatchObject({ excludedCardVersionIds: [], maxHeroes: null, squadOvrRange: { min: 75, max: 99 } });
  store.reset();
  expect(getExcludedCardManagementCount(store.getState())).toBe(0);
});

test('card identity distinguishes versions and never falls back to player identity', () => {
  expect(getCardVersionId({ id: 10, raw: { id: 10, player_id: 1 } })).toBe('10');
  expect(getCardVersionId({ id: 20, players: [{ id: 1 }] })).toBe('20');
  expect(getCardVersionId({ version_id: 30, player_id: 1 })).toBe('30');
  expect(getCardVersionId({ player_id: 1, players: { id: 1 } })).toBeNull();
});
