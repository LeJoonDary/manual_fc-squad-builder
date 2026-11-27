import { expect, test, vi } from 'vitest';
import { createSpecialCardsPreference, INCLUDE_SPECIAL_CARDS_KEY } from './specialCardsPreference.js';

test.each([null, 'true', 'false', 'invalid'])('restores %s without overwriting storage during initialization', stored => {
  const storage = { getItem: vi.fn(() => stored), setItem: vi.fn() };
  const preference = createSpecialCardsPreference(() => storage);
  expect(preference.value).toBe(true);
  expect(storage.getItem).not.toHaveBeenCalled();
  preference.hydrate();
  expect(preference.value).toBe(stored !== 'false');
  expect(storage.setItem).not.toHaveBeenCalled();
});
test('user changes persist across new page instances in a dedicated key', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const first = createSpecialCardsPreference(() => storage);
  first.hydrate(); first.set(false);
  expect(values.get(INCLUDE_SPECIAL_CARDS_KEY)).toBe('false');
  const reloaded = createSpecialCardsPreference(() => storage);
  reloaded.hydrate(); expect(reloaded.value).toBe(false);
  reloaded.set(true);
  first.hydrate(); expect(first.value).toBe(true);
  expect([...values.keys()]).toEqual(['metaxi_include_special_cards_v1']);
});
test('SSR and blocked storage keep a working in-memory setting', () => {
  const preference = createSpecialCardsPreference(() => { throw new Error('Storage blocked'); });
  expect(() => preference.hydrate()).not.toThrow();
  expect(preference.value).toBe(true);
  expect(() => preference.set(false)).not.toThrow();
  expect(preference.value).toBe(false);
});
