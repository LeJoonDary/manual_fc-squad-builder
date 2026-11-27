import { expect, test } from 'vitest';
import { createSavedEvosStore, SAVED_EVOS_KEY } from './savedEvos.js';

test('load guard, limit, card updates, snapshot isolation and individual deletion', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key,value) => data.set(key,value) };
  const store = createSavedEvosStore(() => storage);
  expect(store.save({ id: 1 }, { overall: 95 })).toBe('loading');
  expect(data.size).toBe(0);
  store.load();
  for (let id = 1; id <= 10; id++) expect(store.save({ id, name: 'Player' }, { overall: 95 })).toBe('saved');
  expect(store.save({ id: 11 }, { overall: 95 })).toBe('full');
  const player = { id: 1, name: 'Updated' };
  expect(store.save(player, { overall: 99, forceFullChem: true, addedPositions: ['ST'], faceStats: { pac: 98 }, sm: 5, wf: 5 })).toBe('saved');
  player.name = 'Mutated';
  expect(store.entries).toHaveLength(10);
  expect(store.entries[0].player.name).toBe('Updated');
  const restored = createSavedEvosStore(() => storage); restored.load();
  expect(restored.entries.find(item => item.id === '1').customOverrides.overall).toBe(99);
  store.remove('1'); expect(store.entries).toHaveLength(9);
  expect(JSON.parse(data.get(SAVED_EVOS_KEY))).toHaveLength(9);
});

test('corrupt and inaccessible storage never writes on load and reports failed saves', () => {
  let writes = 0;
  const store = createSavedEvosStore(() => ({ getItem: () => '{bad', setItem: () => { writes++; throw Error('quota'); } }));
  store.load(); expect(writes).toBe(0); expect(store.entries).toEqual([]);
  expect(store.save({ id: 1 }, { overall: 90 })).toBe('error');
  expect(store.entries).toEqual([]);
});
