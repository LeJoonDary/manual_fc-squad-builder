import { expect, test, vi } from 'vitest';
import { readSquadState, writeSquadState, createSquadAutosave, SQUAD_STORAGE_KEY } from './squadPersistence.js';
import { createExcludedCardVersionsStore } from './excludedCardVersions.js';
const formations = [{ name: 'test', slots: [{ position: 'ST' }, { position: 'GK' }] }];
const memory = () => { const data = new Map(); return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }; };
test('round trips original card, owned/locked state, all overrides and builder settings', () => {
  const storage = memory();
  const customOverrides = { forceFullChem: true, addedPositions: ['CM'], backgroundUrl: 'https://example.com/card.png', versionLabel: 'Custom', overall: 99, faceStats: { pac: 98, sho: 97, pas: 96, dri: 95, def: 94, phy: 93 }, sm: 5, wf: 4, playstyles: [{ playstyle_id: 1, name: 'Test', is_plus: true }] };
  const originalCard = { id: 123, name: 'Player', overall: 80, price: 500 };
  const excludedCards = { excludedCardVersionIds: ['9'], excludedCardVersionNames: { 9: 'Excluded Player - Gold' }, excludedCardVersionCards: { 9: { id: 9, overall: 90, image_url: '/player.png', version: 'Gold' } }, maxIcons: 2 };
  writeSquadState(storage, { formation: 'test', players: { ST: { originalCard, card: { ...originalCard, overall: 99 }, isLocked: true, isOwned: true, customOverrides }, GK: null }, manager: { league: 'League', nation: 'Nation' }, maxBudget: 1000, minChemistry: 27, excludedCards, advancedSettings: { filters: { positions: new Set(['ST']), league: '10' }, tacticalSlotRoles: { ST: [{ name: 'Poacher', minLevel: 2 }] } } });
  const result = readSquadState(storage, formations);
  expect(result.players.ST).toMatchObject({ card: originalCard, isOwned: true, isLocked: true, customOverrides });
  expect(result.players.GK).toBeNull(); expect(result.budget).toBe(1000); expect(result.minChemistry).toBe(27);
  expect(result.excludedCards).toEqual(excludedCards); expect(result.advancedSettings.filters.positions).toEqual(['ST']);
  const store = createExcludedCardVersionsStore(() => storage); store.restore(result.excludedCards);
  expect(store.getState().excludedCardVersionNames['9']).toBe('Excluded Player - Gold'); expect(store.getState().maxIcons).toBe(2);
  expect(store.getState().excludedCardVersionCards['9']).toEqual(excludedCards.excludedCardVersionCards['9']);
});
test('legacy snapshots merge missing fields and malformed storage is safe', () => {
  const storage = memory(); storage.setItem(SQUAD_STORAGE_KEY, JSON.stringify({ version: 1, formation: 'test', players: { ST: { card: { id: 1 } } }, budget: 400 }));
  const state = readSquadState(storage, formations);
  expect(state).toMatchObject({ budget: 400, minChemistry: 33, excludedCards: {}, advancedSettings: {}, manager: null });
  expect(state.players.ST.isOwned).toBe(false);
  expect(readSquadState({ getItem() { throw Error('blocked'); } }, formations)).toBeNull();
  expect(writeSquadState({ setItem() { throw Error('quota'); } }, { players: {} })).toBe(false);
});
test('hydration guard, debounce and immediate flush preserve the latest changes', () => {
  vi.useFakeTimers();
  try {
    let state = 'empty'; const writes = []; const save = createSquadAutosave(() => writes.push(state));
    save.schedule(); save.flush(); vi.advanceTimersByTime(200); expect(writes).toEqual([]);
    state = 'restored'; save.hydrate(); save.schedule(); vi.advanceTimersByTime(100);
    state = 'edited'; save.schedule(); vi.advanceTimersByTime(174); expect(writes).toEqual([]);
    vi.advanceTimersByTime(1); expect(writes).toEqual(['edited']);
    state = 'cleared'; save.schedule(); save.flush(); vi.advanceTimersByTime(200); expect(writes).toEqual(['edited', 'cleared']);
    const blocked = createSquadAutosave(() => { throw Error('quota'); }); blocked.hydrate(); expect(() => blocked.flush()).not.toThrow();
  } finally { vi.useRealTimers(); }
});
