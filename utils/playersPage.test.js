// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeAll, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('./playerFilters.js', async original => ({ ...(await original()), fetchPlayersPage: mocks.fetch }));
vi.mock('./playstyleFilters.js', async original => ({ ...(await original()), fetchPlaystyleOptions: async () => [] }));
vi.mock('./affiliations.js', async original => ({ ...(await original()), fetchAffiliations: async () => ({ leagues: [], nations: [], clubs: [] }) }));
vi.mock('../components/AutoBuildSettings.jsx', () => ({ mountAutoBuildSettings: () => () => {} }));

const rows = (offset, count) => Array.from({ length: count }, (_, i) => ({
  id: offset + i + 1, overall: 90, price: 1000, version: 'Gold',
  players: { name: `Player ${offset + i + 1}` }, card_positions: [{ is_primary: true, positions: { name: 'ST' } }],
}));
const button = () => document.querySelector('#players-load-more');
const count = () => document.querySelector('#players-result-count').textContent;

beforeAll(async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  document.documentElement.innerHTML = readFileSync('index.html', 'utf8');
  await import('../main.js');
});

test('appends 40 at a time, retries in place, resets search and ignores stale pages', async () => {
  mocks.fetch.mockImplementation(async (_db, _filters, { offset }) => ({ rows: rows(offset, Math.min(40, 93 - offset)), total: 93 }));
  document.querySelector('[data-tab="players"]').click();
  await vi.waitFor(() => expect(count()).toBe('Showing 40 of 93'));
  const firstCard = document.querySelector('#players-grid').firstElementChild;
  expect(button().textContent).toBe('Load More (40 Players)');
  let resolvePage;
  mocks.fetch.mockImplementationOnce(() => new Promise(resolve => { resolvePage = resolve; }));
  button().click();
  expect(button().disabled).toBe(true);
  expect(button().textContent).toBe('Loading players...');
  button().click();
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  resolvePage({ rows: rows(40, 40), total: 93 });
  await vi.waitFor(() => expect(count()).toBe('Showing 80 of 93'));
  expect(document.querySelector('#players-grid').firstElementChild).toBe(firstCard);
  expect(document.querySelector('#players-grid').children).toHaveLength(80);
  expect(button().textContent).toBe('Load More (13 Players)');
  mocks.fetch.mockRejectedValueOnce(new Error('offline'));
  button().click();
  await vi.waitFor(() => expect(button().textContent).toBe('Try Again'));
  expect(document.querySelector('#players-grid').children).toHaveLength(80);
  button().click();
  await vi.waitFor(() => expect(count()).toBe('Showing 93 of 93'));
  expect(mocks.fetch.mock.calls.at(-1)[2].offset).toBe(80);
  expect(button().hidden).toBe(true);
  expect(document.querySelector('#players-pagination-status').textContent).toBe('Showing 93 of 93 matching cards, ranked by OVR.');

  document.querySelector('[data-tab="players"]').click();
  await vi.waitFor(() => expect(count()).toBe('Showing 40 of 93'));
  mocks.fetch.mockImplementationOnce(() => new Promise(resolve => { resolvePage = resolve; }));
  button().click();
  const search = document.querySelector('#player-name-search');
  const panel = document.querySelector('.players-results');
  panel.scrollTop = 600;
  mocks.fetch.mockResolvedValueOnce({ rows: rows(200, 7), total: 7 });
  search.value = 'New Player';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.waitFor(() => expect(count()).toBe('Showing 7 of 7'));
  expect(mocks.fetch.mock.calls.at(-1)[2].offset).toBe(0);
  expect(panel.scrollTop).toBe(0);
  resolvePage({ rows: rows(40, 40), total: 93 });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(count()).toBe('Showing 7 of 7');
  expect(document.querySelector('#players-grid').children).toHaveLength(7);

  mocks.fetch.mockResolvedValueOnce({ rows: [], total: 0 });
  const minOvr = document.querySelector('#min-ovr');
  minOvr.value = '99';
  minOvr.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.waitFor(() => expect(count()).toBe('Showing 0 of 0'));
  expect(mocks.fetch.mock.calls.at(-1)[2].offset).toBe(0);
  expect(button().hidden).toBe(true);
  expect(document.querySelector('#players-grid').textContent).toContain('No matching players.');
});
