import { expect, test, vi } from 'vitest';
import { searchExclusionCards, fetchExcludedCardDetails } from './exclusionCardSearch.js';

function database(response = { data: [], error: null }) {
  const queries = [];
  const db = { from: vi.fn(table => {
    const query = { table };
    for (const method of ['select', 'or', 'order', 'in', 'range']) query[method] = vi.fn(() => query);
    query.abortSignal = vi.fn(async () => response);
    queries.push(query);
    return query;
  }) };
  return { db, queries };
}

test('search filters card versions by both joined names before pagination, with quoted input', async () => {
  const { db, queries } = database({ data: [{ id: 10 }], error: null });
  const signal = new AbortController().signal;
  const keyword = '  A,%_(B)"  ';
  expect(await searchExclusionCards(db, { keyword, offset: 30, signal })).toEqual([{ id: 10 }]);
  const query = queries[0];
  expect(query.table).toBe('card_versions');
  expect(query.select.mock.calls[0][0]).toContain('players!inner(id,name,long_name)');
  expect(query.select.mock.calls[0][0]).toContain('image_url,background_url');
  const pattern = JSON.stringify('%A,\\%\\_(B)"%');
  expect(query.or).toHaveBeenCalledWith(`name.ilike.${pattern},long_name.ilike.${pattern}`, { referencedTable: 'players' });
  expect(query.range).toHaveBeenCalledWith(30, 59);
  expect(query.abortSignal).toHaveBeenCalledWith(signal);
  expect(query.order.mock.calls.map(call => call[0])).toEqual(['overall', 'id']);
});

test('detail loading uses card IDs in bounded chunks, without truncating large lists', async () => {
  const { db, queries } = database();
  await fetchExcludedCardDetails(db, Array.from({ length: 205 }, (_, i) => i + 1), new AbortController().signal);
  expect(queries.map(query => query.in.mock.calls[0][1].length)).toEqual([100, 100, 5]);
  expect(queries.every(query => query.in.mock.calls[0][0] === 'id')).toBe(true);
  expect(queries[2].range).toHaveBeenCalledWith(0, 4);
});

test('empty requests do not contact the database and failures reach the UI', async () => {
  expect(await searchExclusionCards(null, { keyword: ' ' })).toEqual([]);
  expect(await fetchExcludedCardDetails(null, [])).toEqual([]);
  const { db } = database({ data: null, error: new Error('offline') });
  await expect(searchExclusionCards(db, { keyword: 'Name' })).rejects.toThrow('offline');
  await expect(fetchExcludedCardDetails(db, ['1'])).rejects.toThrow('offline');
});
