// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeAll, expect, test, vi } from 'vitest';
import { setLanguage } from '../src/i18n/languageStore';
const mocks = vi.hoisted(() => ({ recommend: vi.fn(), replace: vi.fn(), search: vi.fn(), detail: vi.fn(), services: null }));
vi.mock('./autoBuildUtils', async original => ({ ...(await original()), getRecommendedPlayersForEmptySlot: mocks.recommend, getRecommendedPlayersForSlot: mocks.replace }));
vi.mock('./modalPlayers.js', async original => ({ ...(await original()), fetchModalPlayerPage: mocks.search }));
vi.mock('./playerCatalog.js', async original => ({ ...(await original()), loadPlayerDetail: mocks.detail }));
vi.mock('./preloadImages.ts', () => ({ preloadImages: vi.fn(), preloadCardImages: vi.fn() }));
vi.mock('./playstyleFilters.js', async original => ({ ...(await original()), fetchPlaystyleOptions: async () => [] }));
vi.mock('./affiliations.js', async original => ({ ...(await original()), fetchAffiliations: async () => ({ leagues: [], nations: [], clubs: [] }) }));
vi.mock('../components/AutoBuildSettings.jsx', () => ({ mountAutoBuildSettings: (_el, _formation, _budget, services) => { mocks.services = services; return () => {}; } }));
vi.mock('../components/Analytics.jsx', () => ({ mountAnalytics: () => {} }));
const raw = (id, position) => ({ id, player_id:id, overall:90, price:1000, version:'Gold',
  players:{id,name:`Player ${id}`,nation_id:1}, club_id:1,league_id:1,
  card_positions:[{is_primary:true,positions:{name:position}}] });
const type = value => { const input=document.querySelector('#modal-player-search-input'); input.value=value; input.dispatchEvent(new Event('input',{bubbles:true})); };
beforeAll(async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches:false,addEventListener(){},removeEventListener(){} }));
  vi.stubEnv('VITE_SUPABASE_URL',''); vi.stubEnv('VITE_SUPABASE_ANON_KEY','');
  document.documentElement.innerHTML=readFileSync('index.html','utf8');
  await import('../main.js'); setLanguage('en',false);
});
test('empty-slot UI gates recommendations, prioritizes search, debounces price, and locks selection', async () => {
  const first=document.querySelector('.slot');
  const firstCard=raw(700,first.dataset.position);
  mocks.search.mockResolvedValue([firstCard]); mocks.detail.mockResolvedValue(firstCard);
  expect(document.querySelector('[data-position-mode]')).toBeNull();
  mocks.recommend.mockResolvedValue([{card:firstCard,chemDelta:0,linkName:'',leagueLabel:'Premier League',metaScore:88}]);
  first.click();
  expect(document.querySelector('.slot-recommendations').hidden).toBe(false);
  const tabs = [...document.querySelectorAll('.recommendation-tabs button')];
  expect(tabs).toHaveLength(3);
  expect(tabs.map(button=>button.disabled)).toEqual([false,true,true]);
  expect(tabs[0].getAttribute('aria-pressed')).toBe('true');
  expect(mocks.recommend.mock.calls.at(-1)[1].sort).toBe('all_meta');
  await vi.waitFor(()=>expect(document.querySelector('.recommendation-badge')?.textContent).toBe('Premier League'));
  expect(document.querySelector('.slot-recommendations').textContent).toContain('Meta Recommendations');
  expect(document.querySelector('#guide-control')).toBeNull();
  type('Player');
  await vi.waitFor(() => expect(document.querySelector('#player-list .browser-player-card')).not.toBeNull());
  expect(document.querySelector('#player-list .recommendation-badge')).toBeNull();
  expect(mocks.search).toHaveBeenCalled();
  type('');
  await vi.waitFor(()=>expect(document.querySelector('.recommendation-badge')?.textContent).toBe('Premier League'));
  expect(mocks.recommend.mock.calls.at(-1)[1].sort).toBe('all_meta');
  document.querySelector('#player-list .browser-player-card').click();
  await vi.waitFor(() => expect(first.classList.contains('is-locked')).toBe(true));
  const second=document.querySelector('.slot:not(.occupied)');
  const next=raw(701,second.dataset.position);
  mocks.recommend.mockResolvedValue([{card:next,chemDelta:2,linkName:'Club',metaScore:89.4}]); mocks.detail.mockResolvedValue(next);
  second.click();
  expect([...document.querySelectorAll('.recommendation-tabs button')].every(button=>!button.disabled)).toBe(true);
  expect(document.querySelector('.recommendation-loading[role="status"]')).not.toBeNull();
  await vi.waitFor(() => expect(document.querySelector('.recommendation-badge')?.textContent).toBe('+2 Chem 🔥'));
  expect(document.querySelector('.slot-recommendations').textContent).toContain('Recommended for Locked Squad (1)');
  const metaRow = document.querySelector('#player-list .browser-player-meta-row');
  expect(metaRow.firstElementChild.classList.contains('recommendation-badge')).toBe(true);
  expect(metaRow.lastElementChild.textContent).toBe('Meta Score 89.4');
  expect(document.querySelector('#player-list .browser-player-footer .recommendation-badge')).toBeNull();
  expect(document.querySelector('#player-list').textContent).not.toContain('NaN');
  expect([...document.querySelectorAll('.recommendation-prices button')].map(b=>b.textContent)).toEqual(['10K','30K','50K','100K','300K','500K','1M','All']);
  expect(document.querySelector('.recommendation-prices .budget-input-wrap span').textContent).toBe('C');
  const chip=[...document.querySelectorAll('.recommendation-prices button')].find(b=>b.textContent==='30K'); chip.click();
  await vi.waitFor(() => expect(mocks.recommend.mock.calls.at(-1)[1].slotMaxPrice).toBe(30000));
  vi.useFakeTimers();
  const price=document.querySelector('.recommendation-prices input');
  const before=mocks.recommend.mock.calls.length;
  price.value='10,000';price.dispatchEvent(new Event('input'));
  expect(price.value).toBe('10,000');
  await vi.advanceTimersByTimeAsync(299);expect(mocks.recommend).toHaveBeenCalledTimes(before);
  await vi.advanceTimersByTimeAsync(1);expect(mocks.recommend.mock.calls.at(-1)[1].slotMaxPrice).toBe(10000);
  vi.useRealTimers();
  type('other');
  await vi.waitFor(() => expect(document.querySelector('#player-list .recommendation-badge')).toBeNull());
  type('');
  await vi.waitFor(() => expect(document.querySelector('.recommendation-badge')).not.toBeNull());
  setLanguage('ko',false);
  await vi.waitFor(() => expect(document.querySelector('.recommendation-badge')?.textContent).toBe('+2 케미 🔥'));
  document.querySelector('#player-list .browser-player-card').click();
  await vi.waitFor(() => expect(second.classList.contains('is-locked')).toBe(true));
  const state=mocks.services.getCurrentSquad().find(entry=>String(entry?.card_id)==='701');
  expect(state.isLocked).toBe(true);expect(state.isOwned).toBe(false);
  expect(document.querySelector('#player-modal').hidden).toBe(true);
});

test('replacement shares controls, passes mode and locks the selected upgrade', async () => {
  setLanguage('en', false);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
  const slot = document.querySelector('.slot.occupied');
  slot.querySelector('.lock-player').click();
  const upgrade = raw(702, slot.dataset.position);
  upgrade.player_id = 700;
  mocks.replace.mockResolvedValue([{ card:upgrade, metaScore:92.5, chemDelta:0, bestManager:null }]);
  mocks.detail.mockResolvedValue(upgrade);
  slot.querySelector('.alternative-player').click();
  await vi.waitFor(() => expect(document.querySelector('.alternative-results .browser-player-meta-score')?.textContent).toBe('Meta Score 92.5'));
  expect(document.querySelector('#alternative-title').textContent).toContain('Replacement Recommendations');
  expect(document.querySelector('.alternative-results .recommendation-badge').textContent).toBe('Chem Kept ✅');
  expect(mocks.replace.mock.calls.at(-1)[1]).toMatchObject({mode:'replace',considerManager:true,sort:'maintain_chem'});
  const dialog = document.querySelector('.alternative-dialog');
  const chips = [...dialog.querySelectorAll('.recommendation-prices button')];
  chips.find(b=>b.textContent==='1M').click();
  await vi.waitFor(()=>expect(mocks.replace.mock.calls.at(-1)[1].slotMaxPrice).toBe(1000000));
  expect(dialog.querySelector('.budget-input-wrap input').value).toBe('1,000,000');
  mocks.replace.mockResolvedValue([{ card:upgrade, metaScore:92.5, chemDelta:-2, bestManager:null }]);
  dialog.querySelectorAll('.recommendation-tabs button')[1].click();
  await vi.waitFor(()=>expect(dialog.querySelector('.recommendation-badge')?.textContent).toBe('-2 Chem ⚠️'));
  expect(dialog.querySelector('.recommendation-badge').classList.contains('is-negative')).toBe(true);
  expect(mocks.replace.mock.calls.at(-1)[1].sort).toBe('meta_synergy');
  dialog.querySelector('.browser-player-card').click();
  await vi.waitFor(()=>expect(dialog.open).toBe(false));
  const selected = mocks.services.getCurrentSquad().find(entry=>String(entry?.card_id)==='702');
  expect(selected.isLocked).toBe(true); expect(selected.isOwned).toBe(false);
});

test('empty slot opens on All Meta without search focus and fetches once per opening', async () => {
  setLanguage('en',false);
  mocks.recommend.mockResolvedValue([]);
  const openSlot = document.querySelector('.slot:not(.occupied)');
  const tabs = () => [...document.querySelectorAll('#player-modal .recommendation-tabs button')];
  const close = () => document.querySelector('#player-modal [data-close-modal]').click();
  mocks.recommend.mockClear(); openSlot.click();
  expect(mocks.recommend).toHaveBeenCalledTimes(1);
  expect(tabs().map(button=>button.textContent)).toEqual(['🌍 All Meta','⚡ Meta + Synergy','🔗 Instant Chem Boost']);
  expect(mocks.recommend.mock.calls.at(-1)[1].sort).toBe('all_meta');
  tabs()[0].click(); expect(mocks.recommend).toHaveBeenCalledTimes(1);
  tabs()[1].click(); expect(mocks.recommend.mock.calls.at(-1)[1].sort).toBe('meta_synergy');
  close(); mocks.recommend.mockClear();
  document.querySelectorAll('.slot:not(.occupied)')[1].click();
  expect(mocks.recommend).toHaveBeenCalledTimes(1);
  expect(tabs()[0].getAttribute('aria-pressed')).toBe('true');
  expect(document.activeElement).not.toBe(document.querySelector('#modal-player-search-input'));
  tabs()[2].click(); expect(mocks.recommend.mock.calls.at(-1)[1].sort).toBe('instant_chem');
  close(); mocks.recommend.mockClear(); openSlot.click();
  expect(mocks.recommend).toHaveBeenCalledTimes(1);
  expect(tabs()[0].getAttribute('aria-pressed')).toBe('true');
  close();
  document.querySelectorAll('.slot.is-locked .lock-player').forEach(button=>button.click());
  document.querySelector('.slot.occupied .lock-player').click();
  mocks.recommend.mockClear(); openSlot.click();
  expect(mocks.recommend).toHaveBeenCalledTimes(1);
  expect(mocks.recommend.mock.calls[0][1].sort).toBe('all_meta');
  expect(tabs()[0].getAttribute('aria-pressed')).toBe('true'); close();
});

test.each([
  [1280, true, true],
  [768, true, true],
  [375, true, false],
  [375, false, false],
  [1024, false, false],
])('search autofocus at width %i and desktop pointer %s is %s', async (width, desktopPointer, shouldFocus) => {
  const originalWidth = window.innerWidth;
  const media = vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: query === '(hover: hover) and (pointer: fine)' && desktopPointer,
    addEventListener() {}, removeEventListener() {},
  }));
  const input = document.querySelector('#modal-player-search-input');
  const focus = vi.spyOn(input, 'focus');
  try {
    window.innerWidth = width;
    input.blur();
    document.querySelector('.slot:not(.occupied)').click();
    await new Promise(resolve => requestAnimationFrame(resolve));
    expect(input.hasAttribute('autofocus')).toBe(false);
    expect(document.querySelector('#player-modal .recommendation-tabs button').getAttribute('aria-pressed')).toBe('true');
    if (shouldFocus) {
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      expect(document.activeElement).toBe(input);
    } else {
      expect(focus).not.toHaveBeenCalled();
      expect(document.activeElement).not.toBe(input);
      input.focus(); // Touch users can still explicitly enter the search field.
    }
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('#player-modal').hidden).toBe(true);
  } finally {
    input.blur();
    focus.mockRestore(); media.mockRestore(); window.innerWidth = originalWidth;
  }
});

test.each([
  [800, { card_type: 'SPECIAL_SBC', sbc_price: null }, 'SBC'],
  [801, { card_type: 'SPECIAL_SBC', sbc_price: 99570 }, 'SBC 99.6K'],
  [802, { card_type: 'SPECIAL_TOKEN', token_cost: 300 }, '300'],
])('preserves acquisition costs from selection to pitch for card %s', async (id, costs, expected) => {
  const slot = document.querySelector('.slot:not(.occupied)');
  const card = { ...raw(id, slot.dataset.position), price: 0, ...costs };
  mocks.search.mockResolvedValue([card]);
  mocks.detail.mockResolvedValue(card);
  mocks.recommend.mockResolvedValue([{ card, metaScore: 90, chemDelta: 0 }]);
  slot.click();
  await vi.waitFor(() => expect(document.querySelector('#player-list .card-cost')?.textContent).toBe(expected));
  type(`Player ${id}`);
  await vi.waitFor(() => expect(document.querySelector('#player-list .browser-player-card')?.getAttribute('aria-label')).toContain(`Player ${id}`));
  expect(document.querySelector('#player-list .card-cost').textContent).toBe(expected);
  document.querySelector('#player-list .browser-player-card').click();
  await vi.waitFor(() => expect(slot.querySelector('.card-price-badge .card-cost')?.textContent).toBe(expected));
  slot.querySelector('.owned-player').click();
  expect(slot.querySelector('.card-price-badge').textContent).toBe(expected);
  if (costs.token_cost) expect(slot.querySelector('.card-price-badge svg')).not.toBeNull();
});
