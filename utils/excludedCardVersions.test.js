import { expect, test, vi } from 'vitest';
import { createExcludedCardVersionsStore, EXCLUDED_CARD_VERSIONS_STORAGE_KEY, getCardVersionId } from './excludedCardVersions.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('bulk addition deduplicates and persists/notifies once, with atomic storage failure', () => {
  const storage = memoryStorage();
  const store = createExcludedCardVersionsStore(() => storage);
  store.ban(1, 'Existing');
  const write = vi.spyOn(storage, 'setItem');
  const listener = vi.fn(); store.subscribe(listener);
  expect(store.banMany([1, '2', 2, 3])).toBe(2);
  expect(write).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(store.getState().excludedCardVersionNames['1']).toBe('Existing');
  expect(createExcludedCardVersionsStore(() => storage).getState().excludedCardVersionIds).toEqual(['1', '2', '3']);
  expect(store.banMany([2, 3])).toBe(0);
  expect(write).toHaveBeenCalledTimes(1);
  write.mockImplementation(() => { throw new Error('quota'); });
  expect(() => store.banMany([4, 5])).toThrow('저장하지 못했습니다');
  expect(store.getState().excludedCardVersionIds).toEqual(['1', '2', '3']);
  expect(listener).toHaveBeenCalledTimes(1);
});

test('ban/unban is shared, deduplicated, and restored with names after reload', () => {
  const storage = memoryStorage();
  const store = createExcludedCardVersionsStore(() => storage);
  const listener = vi.fn();
  const unsubscribe = store.subscribe(listener);
  expect(store.getState().excludedCardVersionIds).toEqual([]);
  store.ban(123, '테스트 선수');
  store.ban('123', '중복');
  expect(listener).toHaveBeenCalledTimes(1);
  const restored = createExcludedCardVersionsStore(() => storage);
  expect(restored.getState()).toEqual({ squadOvrRange: { min: 45, max: 99 }, excludedCardVersionIds: ['123'], excludedCardVersionNames: { 123: '테스트 선수' } });
  restored.unban(123);
  expect(createExcludedCardVersionsStore(() => storage).getState().excludedCardVersionIds).toEqual([]);
  unsubscribe();
  store.unban(123);
  expect(listener).toHaveBeenCalledTimes(1);
});

test('invalid storage is tolerated and malformed IDs never become query syntax', () => {
  const storage = memoryStorage();
  storage.setItem(EXCLUDED_CARD_VERSIONS_STORAGE_KEY, '{broken');
  expect(createExcludedCardVersionsStore(() => storage).getState().excludedCardVersionIds).toEqual([]);
  storage.setItem(EXCLUDED_CARD_VERSIONS_STORAGE_KEY, JSON.stringify({ excludedCardVersionIds: [1, '1', null, '2),id.gt.0', {}] }));
  const store = createExcludedCardVersionsStore(() => storage);
  expect(store.getState().excludedCardVersionIds).toEqual(['1']);
  expect(() => store.ban('2),id.gt.0', 'Invalid')).toThrow('카드 버전 ID');
});

test('failed persistence does not claim a successful ban', () => {
  const store = createExcludedCardVersionsStore(() => ({ getItem: () => null, setItem: () => { throw new Error('quota'); } }));
  expect(() => store.ban(1, 'Player')).toThrow('저장하지 못했습니다');
  expect(store.getState().excludedCardVersionIds).toEqual([]);
});

test('bulk removal and reset each persist and notify once, including names', () => {
  const storage = memoryStorage();
  const store = createExcludedCardVersionsStore(() => storage);
  [1, 2, 3].forEach(id => store.ban(id, `Card ${id}`));
  const listener = vi.fn();
  store.subscribe(listener);
  store.unbanMany(['1', 2, 2, 999]);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(createExcludedCardVersionsStore(() => storage).getState()).toEqual({
    squadOvrRange: { min: 45, max: 99 },
    excludedCardVersionIds: ['3'], excludedCardVersionNames: { 3: 'Card 3' },
  });
  store.clear();
  expect(listener).toHaveBeenCalledTimes(2);
  expect(createExcludedCardVersionsStore(() => storage).getState()).toEqual({
    squadOvrRange: { min: 45, max: 99 },
    excludedCardVersionIds: [], excludedCardVersionNames: {},
  });
});

test('card identity distinguishes versions and never falls back to player identity', () => {
  expect(getCardVersionId({ id: 10, raw: { id: 10, player_id: 1 } })).toBe('10');
  expect(getCardVersionId({ id: 20, players: [{ id: 1 }] })).toBe('20');
  expect(getCardVersionId({ version_id: 30, player_id: 1 })).toBe('30');
  expect(getCardVersionId({ player_id: 1, players: { id: 1 } })).toBeNull();
});

test('legacy player bans are not reinterpreted as card-version bans', () => {
  const storage = memoryStorage();
  storage.setItem('fc-squad-builder:excluded-players:v1', JSON.stringify({
    excludedPlayerIds: ['123'], excludedPlayerNames: { 123: 'Legacy player' },
  }));
  const store = createExcludedCardVersionsStore(() => storage);
  expect(store.getState().excludedCardVersionIds).toEqual([]);
  store.ban(456, 'Player · Gold (#456)');
  expect(createExcludedCardVersionsStore(() => storage).getState().excludedCardVersionIds).toEqual(['456']);
});

test('OVR conditions persist without collecting IDs and survive individual ban changes', () => {
  const storage = memoryStorage();
  const store = createExcludedCardVersionsStore(() => storage);
  store.setSquadOvrRange({ min: 75, max: 99 });
  store.ban('123', 'Individual');
  const restored = createExcludedCardVersionsStore(() => storage);
  expect(restored.getState().squadOvrRange).toEqual({ min: 75, max: 99 });
  expect(restored.getState().excludedCardVersionIds).toEqual(['123']);
  expect(() => store.setSquadOvrRange({ min: 90, max: 70 })).toThrow();
});
