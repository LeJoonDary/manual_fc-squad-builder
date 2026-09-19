import { expect, test, vi } from 'vitest';
import { createPlayerPagination, fetchPlayerPage } from './playerPagination.js';

const rows = (start, count = 50) => Array.from({ length: count }, (_, index) => ({ id: start + index }));

test('each action fetches exactly one bounded 50-row page', async () => {
  const query = { limit: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: rows(1) }) };
  await fetchPlayerPage(query, 0);
  await fetchPlayerPage(query, 50);
  expect(query.limit.mock.calls).toEqual([[50], [50]]);
  expect(query.range.mock.calls).toEqual([[0, 49], [50, 99]]);
});

test('details are restricted to the current page IDs and preserve page order', async () => {
  const query = { limit: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [{id: 3}, {id: 1}] }) };
  const details = vi.fn().mockResolvedValue({data: [{id: 1, name: 'One'}, {id: 3, name: 'Three'}]});
  expect(await fetchPlayerPage(query, 50, details)).toEqual([{id: 3, name: 'Three'}, {id: 1, name: 'One'}]);
  expect(details).toHaveBeenCalledExactlyOnceWith([3, 1]);
});

test('empty pages skip details and incomplete detail responses are retryable by the UI', async () => {
  const query = { limit: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [] }) };
  const details = vi.fn().mockResolvedValue({data: []});
  expect(await fetchPlayerPage(query, 0, details)).toEqual([]);
  expect(details).not.toHaveBeenCalled();
  query.range.mockResolvedValue({data: [{id: 1}]});
  await expect(fetchPlayerPage(query, 0, details)).rejects.toThrow('상세 정보');
});

test('appends unique cards and blocks double clicks while loading', () => {
  const pager = createPlayerPagination();
  const first = pager.begin();
  expect(pager.begin()).toBeNull();
  pager.complete(first, rows(1), rows(1));
  const second = pager.begin();
  expect(second.offset).toBe(50);
  pager.complete(second, rows(50), rows(50));
  expect(pager.state.cards).toEqual(rows(1, 99));
  expect(pager.state.offset).toBe(100);
});

test('client-filtered empty pages still allow fetching the next page', () => {
  const pager = createPlayerPagination();
  pager.complete(pager.begin(), rows(1), []);
  expect(pager.state.cards).toEqual([]);
  expect(pager.state.hasMore).toBe(true);
  expect(pager.begin().offset).toBe(50);
});

test('a failed next page preserves cards and retries the same offset', async () => {
  const pager = createPlayerPagination();
  pager.complete(pager.begin(), rows(1), rows(1));
  const ticket = pager.begin();
  const error = new Error('timeout');
  const query = { limit: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ error }) };
  await expect(fetchPlayerPage(query, ticket.offset)).rejects.toThrow('timeout');
  pager.fail(ticket);
  expect(pager.state.cards).toHaveLength(50);
  expect(pager.begin().offset).toBe(50);
});

test('filter reset rejects stale results and resets pagination', () => {
  const pager = createPlayerPagination();
  const stale = pager.begin();
  pager.reset();
  const current = pager.begin();
  expect(pager.complete(stale, rows(1), rows(1))).toBe(false);
  pager.fail(stale);
  expect(pager.state.loading).toBe(true);
  expect(current.offset).toBe(0);
  pager.complete(current, rows(101, 7), rows(101, 7));
  expect(pager.state.cards).toEqual(rows(101, 7));
  expect(pager.state.hasMore).toBe(false);
  expect(pager.begin()).toBeNull();
});
