// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAlternativePlayerModal } from './AlternativePlayerModal.js';
import { setLanguage } from '../src/i18n/languageStore';
import { createPlayerCard } from './PlayerCard.js';
const renderCard = (card, onActivate) => createPlayerCard(card, {
  onActivate, showMetaScore: false, getCardName: c => c.name, getCardRating: c => c.overall,
  getCardPosition: c => c.position, unwrapRelation: value => value,
  affiliationCatalog: {}, createPlaystyleBadges: () => document.createElement('span'),
});

HTMLDialogElement.prototype.showModal = function () { this.open = true; };
HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
beforeEach(() => { setLanguage('en', false); vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); });
afterEach(() => document.body.replaceChildren());

it('shows icons naturally without the obsolete fallback notice', async () => {
  const load = vi.fn().mockResolvedValueOnce([{ card: { name: 'Icon', overall: 90 }, isIcon: true }])
    .mockResolvedValueOnce([]);
  const modal = createAlternativePlayerModal({ load, select: vi.fn(), renderCard });
  await modal.open('ST');
  const notice = document.querySelector('.swap-fallback-notice');
  expect(notice).toBeNull();
  document.querySelector('dialog').close();
  await modal.open('ST');
  expect(document.querySelector('.swap-fallback-notice')).toBeNull();
});

it('preserves standard-first ranking across twenty-card page boundaries', async () => {
  const suggestions = Array.from({ length: 46 }, (_, i) => ({
    card: { id: String(i), name: `Player ${i}`, overall: i < 6 ? 88 - i : 99 - (i - 6) }, isIcon: i >= 6,
  }));
  const load = vi.fn().mockResolvedValue(suggestions);
  const modal = createAlternativePlayerModal({ load, select: vi.fn(), renderCard });
  await modal.open('ST');
  const ratings = () => [...document.querySelectorAll('.ea-card-rating')].map(node => Number(node.textContent));
  expect(ratings()).toEqual(suggestions.slice(0, 20).map(row => row.card.overall));
  const more = document.querySelector('.alternative-load-more');
  expect(more.hidden).toBe(false);
  expect(more.textContent).toBe('Load More (20 Players)');
  more.click();
  expect(ratings()).toEqual(suggestions.slice(0, 40).map(row => row.card.overall));
  more.click();
  expect(ratings()).toEqual(suggestions.map(row => row.card.overall));
  expect(more.hidden).toBe(true);
  expect(load).toHaveBeenCalledTimes(1);
});

it('renders full cards with price and stats and swaps the requested slot', async () => {
  const card = { id: 'new', name: 'Candidate', overall: 90, price: 5400, sm: 4, wf: 5 };
  const select = vi.fn().mockResolvedValue();
  const bestManager = { leagueId: 'league:id:2', nationId: 'nation:id:1' };
  const modal = createAlternativePlayerModal({
    load: async () => [{ card, bestManager, totalChemistry: 33, playerChemistry: 3 }], select, renderCard,
  });
  await modal.open('LB');
  const button = document.querySelector('.browser-player-card');
  expect(document.querySelector('h2').textContent).toBe('Replacement Recommendations (LB)');
  expect(button.querySelector('.ea-card-rating').textContent).toBe('90');
  expect(button.querySelectorAll('.ea-card-stats > span')).toHaveLength(6);
  expect(button.querySelector('.browser-player-price').textContent).toContain('5,400 C');
  expect(button.textContent).toContain('SM 4★ / WF 5★');
  expect(button.querySelector('.browser-player-meta-score')).toBeNull();
  expect(button.textContent).not.toContain('Meta Score');
  expect(document.querySelector('.alternative-spinner')).toBeNull();
  expect(button.textContent).not.toContain('/33');
  button.click();
  await vi.waitFor(() => expect(document.querySelector('dialog').open).toBe(false));
  expect(select).toHaveBeenCalledWith('LB', card, expect.any(AbortSignal), bestManager, { sort: 'maintain_chem', slotMaxPrice: undefined });
});

it('cancels a pending lookup when closed', async () => {
  let finish;
  const load = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const modal = createAlternativePlayerModal({ load, select: vi.fn() });
  const pending = modal.open('CB');
  expect(document.querySelector('.alternative-spinner')).not.toBeNull();
  expect(document.body.textContent).toContain('Finding recommended players…');
  expect(document.querySelector('.swap-modal-header h2')).not.toBeNull();
  document.querySelector('.swap-modal-header .swap-modal-close').click();
  expect(load.mock.calls[0][1].aborted).toBe(true);
  finish([{ card: { name: 'Late result' } }]);
  await pending;
  expect(document.querySelector('.alternative-result')).toBeNull();
});

it('shows empty and error states', async () => {
  const load = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Offline'));
  const modal = createAlternativePlayerModal({ load, select: vi.fn() });
  await modal.open('LB');
  expect(document.body.textContent).toContain('No recommendations match');
  document.querySelector('dialog').close();
  await modal.open('LB');
  expect(document.body.textContent).toContain('Offline');
});

it('price reload cancels stale recommendations and translates controls to Korean', async () => {
  let finish;
  const load = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValue([{card:{id:'fresh',name:'Fresh',overall:90}}]);
  const modal = createAlternativePlayerModal({load,select:vi.fn(),renderCard});
  const pending = modal.open('CM');
  const chip = [...document.querySelectorAll('.recommendation-prices button')].find(button=>button.textContent==='500K');
  chip.click();
  expect(load.mock.calls[0][1].aborted).toBe(true);
  await vi.waitFor(()=>expect(document.querySelector('.alternative-results').textContent).toContain('Fresh'));
  expect(load.mock.calls[1][3]).toEqual({sort:'maintain_chem',slotMaxPrice:500000});
  finish([{card:{name:'Stale',overall:99}}]); await pending;
  expect(document.querySelector('.alternative-results').textContent).not.toContain('Stale');
  setLanguage('ko',false);
  expect(document.querySelector('#alternative-title').textContent).toBe('대체 선수 추천 (CM)');
  expect(document.querySelector('.recommendation-tabs').textContent).toContain('케미 유지/상승');
  document.querySelector('dialog').close();
});
