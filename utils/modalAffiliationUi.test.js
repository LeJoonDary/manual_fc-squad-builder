// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeAll, expect, test, vi } from 'vitest';
import { setLanguage } from '../src/i18n/languageStore';
const mocks = vi.hoisted(() => ({ recommend: vi.fn(async () => []), search: vi.fn(async () => []) }));
vi.mock('./autoBuildUtils', async original => ({ ...(await original()), getRecommendedPlayersForEmptySlot: mocks.recommend }));
vi.mock('./modalPlayers.js', async original => ({ ...(await original()), fetchModalPlayerPage: mocks.search }));
vi.mock('./playstyleFilters.js', async original => ({ ...(await original()), fetchPlaystyleOptions: async () => [] }));
vi.mock('./affiliations.js', async original => ({ ...(await original()), fetchAffiliations: async () => ({
  leagues: [{ id: 2, name: 'LALIGA EA SPORTS' }, { id: 6, name: 'Liga F Moeve' }],
  nations: [{ id: 5, name: 'France' }], clubs: [{ id: 100, name: 'Real Madrid', league_id: 2, league_name: 'LALIGA EA SPORTS' }, { id: 200, name: 'Real Madrid', league_id: 6, league_name: 'Liga F Moeve' }],
}) }));
vi.mock('../components/AutoBuildSettings.jsx', () => ({ mountAutoBuildSettings: () => () => {} }));
beforeAll(async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubEnv('VITE_SUPABASE_URL', ''); vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  document.documentElement.innerHTML = readFileSync('index.html', 'utf8');
  await import('../main.js'); setLanguage('en', false);
});
test('unlocked slot affiliations apply to recommendations, names and price; reset on close and new slot', async () => {
  document.querySelector('.slot[data-position="LS"]').click();
  const trigger = () => document.querySelector('.modal-affiliation-trigger');
  trigger().click();
  expect(document.querySelector('#modal-club-picker [data-affiliation-id="200"] .women-league-badge')).not.toBeNull();
  const select = (kind, value) => { const node = document.querySelector(`#modal-${kind}-filter`); node.value = value; node.dispatchEvent(new Event('change')); };
  select('club', '200'); select('league', '2');
  expect(document.querySelector('#modal-club-filter').value).toBe('');
  expect([...document.querySelector('#modal-club-filter').options].map(option => option.value)).toEqual(['', '100']);
  select('club', '100'); select('nation', '5');
  document.querySelector('.modal-affiliation-apply').click();
  expect(mocks.recommend.mock.calls.at(-1)[1].affiliation).toEqual({ leagueId: '2', clubId: '100', nationId: '5' });
  expect(trigger().textContent).toContain('Affiliation (3)');
  const input = document.querySelector('#modal-player-search-input'); input.value = 'Mbappe'; input.dispatchEvent(new Event('input'));
  await vi.waitFor(() => expect(mocks.search).toHaveBeenCalled());
  expect(mocks.search.mock.calls.at(-1)[1].affiliation.clubId).toBe('100');
  [...document.querySelectorAll('#player-modal .recommendation-prices button')].find(button => button.textContent === '30K').click();
  await vi.waitFor(() => expect(mocks.search.mock.calls.at(-1)[1].maxPrice).toBe(30000));
  expect(mocks.search.mock.calls.at(-1)[1].affiliation.clubId).toBe('100');
  setLanguage('ko', false); expect(trigger().textContent).toContain('소속 (3)');
  trigger().click(); document.querySelector('#modal-affiliation-popover').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('#player-modal').hidden).toBe(false);
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  document.querySelector('#player-modal [data-close-modal]').click();
  document.querySelector('.slot[data-position="RS"]').click();
  expect(mocks.recommend.mock.calls.at(-1)[1].affiliation).toEqual({ leagueId: '', clubId: '', nationId: '' });
  expect(trigger().textContent).toBe('🌐 소속');
});
