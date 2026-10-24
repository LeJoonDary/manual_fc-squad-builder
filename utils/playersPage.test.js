// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeAll, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), modalFetch: vi.fn(), preload: vi.fn(), preloadCards: vi.fn() }));
vi.mock('./modalPlayers.js', async original => ({ ...(await original()), fetchModalPlayerPage: mocks.modalFetch }));
vi.mock('./preloadImages.ts', () => ({ preloadImages: mocks.preload, preloadCardImages: mocks.preloadCards }));
vi.mock('./playerFilters.js', async original => ({ ...(await original()), fetchPlayersPage: mocks.fetch }));
vi.mock('./playstyleFilters.js', async original => ({ ...(await original()), fetchPlaystyleOptions: async () => [] }));
vi.mock('./affiliations.js', async original => ({ ...(await original()), fetchAffiliations: async () => ({ leagues: [], nations: [], clubs: [] }) }));
vi.mock('../components/AutoBuildSettings.jsx', () => ({ mountAutoBuildSettings: () => () => {} }));
vi.mock('../components/GuideModal.jsx', () => ({ mountGuideControl: () => {} }));
vi.mock('../components/Analytics.jsx', () => ({ mountAnalytics: () => {} }));

const rows = (offset, count) => Array.from({ length: count }, (_, i) => ({
  id: offset + i + 1, overall: 90, price: 1000, version: 'Gold',
  image_url: `/player-${offset + i + 1}.png`,
  players: { name: `Player ${offset + i + 1}` }, card_positions: [{ is_primary: true, positions: { name: 'ST' } }],
}));
const button = () => document.querySelector('#players-load-more');
const count = () => document.querySelector('#players-result-count').textContent;

beforeAll(async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  document.documentElement.innerHTML = readFileSync('index.html', 'utf8');
  await import('../main.js');
});

test('appends 15 at a time, retries in place, resets search and ignores stale pages', async () => {
  mocks.fetch.mockClear();
  mocks.fetch.mockImplementation(async (_db, _filters, { offset }) => ({ rows: rows(offset, Math.min(15, 43 - offset)), total: 43 }));
  document.querySelector('[data-tab="players"]').click();
  await vi.waitFor(() => expect(count()).toBe('Showing 15 of 43'));
  expect(mocks.preloadCards).toHaveBeenLastCalledWith(expect.arrayContaining([
    expect.objectContaining({ image_url: '/player-1.png' }),
    expect.objectContaining({ image_url: '/player-15.png' }),
  ]));
  expect(mocks.preloadCards.mock.calls.at(-1)[0]).toHaveLength(15);
  const firstCard = document.querySelector('#players-grid').firstElementChild;
  expect(button().textContent).toBe('Load More (15 Players)');
  let resolvePage;
  mocks.fetch.mockImplementationOnce(() => new Promise(resolve => { resolvePage = resolve; }));
  button().click();
  expect(button().disabled).toBe(true);
  expect(button().textContent).toBe('Loading players...');
  button().click();
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  resolvePage({ rows: rows(15, 15), total: 43 });
  await vi.waitFor(() => expect(count()).toBe('Showing 30 of 43'));
  expect(document.querySelector('#players-grid').firstElementChild).toBe(firstCard);
  expect(document.querySelector('#players-grid').children).toHaveLength(30);
  expect(button().textContent).toBe('Load More (13 Players)');
  mocks.fetch.mockRejectedValueOnce(new Error('offline'));
  button().click();
  await vi.waitFor(() => expect(button().textContent).toBe('Try Again'));
  expect(document.querySelector('#players-grid').children).toHaveLength(30);
  button().click();
  await vi.waitFor(() => expect(count()).toBe('Showing 43 of 43'));
  expect(mocks.fetch.mock.calls.at(-1)[2].offset).toBe(30);
  expect(button().hidden).toBe(true);
  expect(document.querySelector('#players-pagination-status').textContent).toBe('Showing 43 of 43 matching cards, ranked by OVR.');

  // A different filter context must fetch independently of completed cached pages.
  const changedFilter = document.querySelector('#min-ovr');
  changedFilter.value = '80';
  changedFilter.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-tab="players"]').click();
  await vi.waitFor(() => expect(count()).toBe('Showing 15 of 43'));
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
  resolvePage({ rows: rows(15, 15), total: 43 });
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

test.each(['players', 'modal'])('%s search requires two characters and debounces the latest input by 180ms', async surface => {
  const isModal = surface === 'modal';
  const fetch = isModal ? mocks.modalFetch : mocks.fetch;
  fetch.mockResolvedValue(isModal ? rows(1000, 1) : { rows: rows(1000, 1), total: 1 });
  if (isModal) document.querySelector('.slot').click();
  await Promise.resolve();
  fetch.mockClear();
  const input = document.querySelector(isModal ? '#modal-player-search-input' : '#player-name-search');
  const type = value => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
  vi.useFakeTimers();
  try {
    type('r');
    await vi.advanceTimersByTimeAsync(500);
    expect(fetch).not.toHaveBeenCalled();
    type('ro');
    await vi.advanceTimersByTimeAsync(179);
    expect(fetch).not.toHaveBeenCalled();
    type('ron');
    await vi.advanceTimersByTimeAsync(179);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1][isModal ? 'keyword' : 'name']).toBe('ron');
    fetch.mockClear();
    type('r');
    type('ron');
    // Cached hits render in the input event, before any timer or promise is awaited.
    expect(fetch).not.toHaveBeenCalled();
    const results = document.querySelector(isModal ? '#player-list' : '#players-grid');
    expect(results.textContent).toContain('Player 1001');
    expect(results.textContent).not.toContain('Loading');
    await vi.advanceTimersByTimeAsync(180);
    expect(fetch).not.toHaveBeenCalled();
    type('손흥');
    await vi.advanceTimersByTimeAsync(100);
    type('손');
    await vi.advanceTimersByTimeAsync(500);
    expect(fetch).not.toHaveBeenCalled();
    type('손흥');
    await vi.advanceTimersByTimeAsync(180);
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockClear();
    type('fresh search');
    await vi.advanceTimersByTimeAsync(180);
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

test.each(['players', 'modal'])('%s waits for portraits before committing cards and discards stale batches', async surface => {
  const isModal = surface === 'modal';
  const fetch = isModal ? mocks.modalFetch : mocks.fetch;
  fetch.mockResolvedValue(isModal ? rows(2000, 15) : { rows: rows(2000, 15), total: 15 });
  if (isModal) document.querySelector('.slot').click();
  await Promise.resolve();
  const input = document.querySelector(isModal ? '#modal-player-search-input' : '#player-name-search');
  const results = document.querySelector(isModal ? '#player-list' : '#players-grid');
  const type = value => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
  vi.useFakeTimers();
  try {
    let finish;
    mocks.preloadCards.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    type('waiting batch');
    await vi.advanceTimersByTimeAsync(180);
    expect(results.querySelectorAll('.browser-player-card')).toHaveLength(0);
    expect(results.textContent).toContain('Loading');
    type('x');
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(results.querySelectorAll('.browser-player-card')).toHaveLength(0);
    expect(results.textContent).toContain('at least 2');
    mocks.preloadCards.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    type('completed batch');
    await vi.advanceTimersByTimeAsync(180);
    expect(results.querySelectorAll('.browser-player-card')).toHaveLength(0);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(results.querySelectorAll('.browser-player-card')).toHaveLength(15);
    // Return to a neutral input for subsequent integration cases.
    type('x');
  } finally {
    mocks.preloadCards.mockReset();
    vi.useRealTimers();
  }
});
