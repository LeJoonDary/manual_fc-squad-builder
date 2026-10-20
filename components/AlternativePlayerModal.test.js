// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createAlternativePlayerModal } from './AlternativePlayerModal.js';
import { createPlayerCard } from './PlayerCard.js';
const renderCard = (card, onActivate) => createPlayerCard(card, {
  onActivate, showMetaScore: false, getCardName: c => c.name, getCardRating: c => c.overall,
  getCardPosition: c => c.position, unwrapRelation: value => value,
  affiliationCatalog: {}, createPlaystyleBadges: () => document.createElement('span'),
});

HTMLDialogElement.prototype.showModal = function () { this.open = true; };
HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
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

it('preserves standard-first ranking across eight-card page boundaries', async () => {
  const suggestions = Array.from({ length: 26 }, (_, i) => ({
    card: { id: String(i), name: `Player ${i}`, overall: i < 6 ? 88 - i : 99 - (i - 6) }, isIcon: i >= 6,
  }));
  const load = vi.fn().mockResolvedValue(suggestions);
  const modal = createAlternativePlayerModal({ load, select: vi.fn(), renderCard });
  await modal.open('ST');
  const ratings = () => [...document.querySelectorAll('.browser-player-rating')].map(node => Number(node.textContent));
  expect(ratings()).toEqual([88, 87, 86, 85, 84, 83, 99, 98]);
  const more = document.querySelector('.alternative-load-more');
  expect(more.hidden).toBe(false);
  expect(more.textContent).toBe('Load More (8 Players)');
  more.click();
  expect(ratings().slice(8)).toEqual([97, 96, 95, 94, 93, 92, 91, 90]);
  more.click();
  expect(ratings().slice(16)).toEqual([89, 88, 87, 86, 85, 84, 83, 82]);
  more.click();
  expect(ratings()).toHaveLength(26);
  expect(ratings().slice(24)).toEqual([81, 80]);
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
  expect(document.querySelector('h2').textContent).toBe('Alternative Players (Maintains Target Chem)');
  expect(button.querySelector('.browser-player-rating').textContent).toBe('90');
  expect(button.querySelectorAll('.browser-player-stat')).toHaveLength(6);
  expect(button.querySelector('.browser-player-price').textContent).toContain('5,400 C');
  expect(button.textContent).toContain('SM 4★ / WF 5★');
  expect(button.querySelector('.browser-player-meta-score')).toBeNull();
  expect(button.textContent).not.toContain('Meta Score');
  expect(document.querySelector('.alternative-spinner')).toBeNull();
  expect(button.textContent).not.toContain('/33');
  button.click();
  await vi.waitFor(() => expect(document.querySelector('dialog').open).toBe(false));
  expect(select).toHaveBeenCalledWith('LB', card, expect.any(AbortSignal), bestManager);
});

it('cancels a pending lookup when closed', async () => {
  let finish;
  const load = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const modal = createAlternativePlayerModal({ load, select: vi.fn() });
  const pending = modal.open('CB');
  expect(document.querySelector('.alternative-spinner')).not.toBeNull();
  expect(document.body.textContent).toContain('Calculating chemistry & finding alternatives...');
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
  expect(document.body.textContent).toContain('No eligible alternatives');
  document.querySelector('dialog').close();
  await modal.open('LB');
  expect(document.body.textContent).toContain('Offline');
});
