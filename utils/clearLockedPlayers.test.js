// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { setLanguage } from '../src/i18n/languageStore';

const mocks = vi.hoisted(() => ({ services: null }));
vi.mock('../components/AutoBuildSettings.jsx', () => ({ mountAutoBuildSettings: (_el, _formation, _budget, services) => { mocks.services = services; return () => {}; } }));
vi.mock('../components/Analytics.jsx', () => ({ mountAnalytics: () => {} }));
vi.mock('./playstyleFilters.js', async original => ({ ...(await original()), fetchPlaystyleOptions: async () => [] }));
vi.mock('./affiliations.js', async original => ({ ...(await original()), fetchAffiliations: async () => ({ leagues: [], nations: [], clubs: [] }) }));

test('Clear All keeps locked state and persists it, then removes players after unlocking', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubEnv('VITE_SUPABASE_URL', ''); vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  document.documentElement.innerHTML = readFileSync('index.html', 'utf8');
  const [lockedSlot, unlockedSlot] = document.querySelectorAll('.pitch .slot');
  const entry = (id, slot, isLocked) => ({
    card: { id, player_id: id, name: `Player ${id}`, overall: 90, price: 1000, primary_position: slot.dataset.position, secondary_positions: [] },
    isLocked, isOwned: isLocked, customOverrides: isLocked ? { overall: 95, addedPositions: ['CM'] } : {},
  });
  const locked = entry(9001, lockedSlot, true);
  localStorage.setItem('metaxi_squad_state_v1', JSON.stringify({ version: 1, formation: '4-3-1-2', players: {
    [lockedSlot.dataset.position]: locked,
    [unlockedSlot.dataset.position]: entry(9002, unlockedSlot, false),
  }, manager: { name: 'Manager', league: 'League', nation: 'Nation' }, budget: 10000 }));
  await import('../main.js');
  await mocks.services.initializeAutoResume();
  setLanguage('en', false);
  const clear = () => document.querySelector('#clear-squad').click();
  const saved = () => JSON.parse(localStorage.getItem('metaxi_squad_state_v1'));
  const before = saved().players[lockedSlot.dataset.position];
  clear();
  expect(saved().players[lockedSlot.dataset.position]).toEqual(before);
  expect(saved().players[unlockedSlot.dataset.position]).toBeNull();
  expect(saved().manager).toBeNull();
  expect(document.body.textContent).toContain('Cleared unlocked players. Locked players were kept.');
  const remaining = document.querySelector(`.slot[data-position="${lockedSlot.dataset.position}"]`);
  expect(remaining.querySelector('.remove-player')).toBeNull();
  setLanguage('ko', false);
  clear();
  expect(document.body.textContent).toContain('배치된 선수가 모두 잠겨 있습니다. 잠금을 해제한 뒤 X 버튼으로 제거해 주세요.');
  expect(saved().players[lockedSlot.dataset.position]).toEqual(before);
  remaining.querySelector('.lock-player').click();
  expect(remaining.querySelector('.remove-player')).not.toBeNull();
  clear();
  expect(Object.values(saved().players).every(value => value === null)).toBe(true);
});
