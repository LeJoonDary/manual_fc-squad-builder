import { expect, test } from 'vitest';
import { fetchPlayerCards } from './playerCards.js';

function database(pages) {
  const offsets = [];
  return {
    offsets,
    from: () => ({ select: () => ({ order: () => ({
      range: async (offset) => {
        offsets.push(offset);
        return pages.shift();
      },
    }) }) }),
  };
}

test('continues paging even when the server returns less than the requested page size', async () => {
  const db = database([{ data: [{ id: 1 }, { id: 2 }] }, { data: [{ id: 3 }] }, { data: [] }]);
  expect(await fetchPlayerCards(db)).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  expect(db.offsets).toEqual([0, 2, 3]);
});

test('query failures propagate without returning partial or sample cards', async () => {
  const error = { code: '42703', message: 'Column does not exist' };
  const db = database([{ data: [{ id: 1 }] }, { data: null, error }]);
  await expect(fetchPlayerCards(db)).rejects.toEqual(error);
});

test('missing configuration is an error and an empty database returns no cards', async () => {
  await expect(fetchPlayerCards(null)).rejects.toThrow('Supabase');
  expect(await fetchPlayerCards(database([{ data: [] }]))).toEqual([]);
});
