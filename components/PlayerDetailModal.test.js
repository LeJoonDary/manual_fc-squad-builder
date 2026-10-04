// @vitest-environment jsdom
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import html from '../index.html?raw';
import { createPlayerDetailModal } from './PlayerDetailModal.js';
import { excludedCardVersionsStore, EXCLUDED_CARD_VERSIONS_STORAGE_KEY } from '../utils/excludedCardVersions.js';

let panels = [];
test('SBC detail artwork corrects the legacy URL and clears when switching cards', async () => {
  const detail = setup();
  await detail.open({ id: 20051, name: 'A. Bouaddi', version: 'special_SBC',
    background_url: 'https://example.com/card-templates/spcial_ones_to_watch_edited.png' });
  expect(document.querySelector('.player-detail-artwork').style.backgroundImage).toContain('/special_ones_to_watch_edited.png');
  await detail.open({ id: 790, name: 'A. Bouaddi', version: 'Gold' });
  expect(document.querySelector('.player-detail-artwork')).toBeNull();
});
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
  for (const id of excludedCardVersionsStore.getState().excludedCardVersionIds) excludedCardVersionsStore.unban(id);
  document.body.innerHTML = html;
});

test('reviews are card-specific, open a vertical player and remove playback on close', async () => {
  const db = { from: table => ({
    select() { return this; }, eq(key, id) { this.id = id; return this; },
    single() { return Promise.resolve({ data: { id: this.id, name: 'Player' } }); },
    maybeSingle() { return Promise.resolve({ data: this.id === 1 ? { youtube_video_id: 'abcdefghijk', title: 'Review' } : null }); },
  }) };
  const detail = setup(db);
  await detail.open({ id: 1, name: 'Player' });
  expect(document.querySelector('.youtube-review-button').hidden).toBe(false);
  expect(document.querySelector('.youtube-review-button').textContent).toBe('▶ Gameplay Review');
  document.querySelector('.youtube-review-button').click();
  expect(document.querySelector('iframe').src).toBe('https://www.youtube.com/embed/abcdefghijk?autoplay=1');
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
  document.querySelector('.youtube-review-close').dispatchEvent(escape);
  expect(document.querySelector('iframe')).toBeNull();
  expect(detail.isOpen).toBe(true);
  await detail.open({ id: 2, name: 'Other' });
  expect(document.querySelector('.youtube-review-button').hidden).toBe(true);
});

test('a card review opens directly without opening player details', () => {
  const detail = setup();
  detail.openReview({ youtube_video_id: 'abcdefghijk', title: 'Gameplay' });
  expect(detail.isOpen).toBe(false);
  expect(document.querySelector('.youtube-review-dialog').open).toBe(true);
  expect(document.querySelector('iframe').src).toBe('https://www.youtube.com/embed/abcdefghijk?autoplay=1');
  document.querySelector('.youtube-review-close').click();
  expect(document.querySelector('iframe')).toBeNull();
});

test('late reviews do not attach to a newly selected card', async () => {
  const pending = [];
  const detail = setup({ from: () => ({
    select() { return this; }, eq(key, id) { this.id = id; return this; },
    single() { return Promise.resolve({ data: { id: this.id, name: this.id } }); },
    maybeSingle() { return new Promise(resolve => pending.push(resolve)); },
  }) });
  const first = detail.open({ id: 'first', name: 'First' });
  const second = detail.open({ id: 'second', name: 'Second' });
  pending[1]({ data: null });
  await second;
  pending[0]({ data: { youtube_video_id: 'abcdefghijk' } });
  await first;
  expect(document.querySelector('.youtube-review-button').hidden).toBe(true);
  expect(document.querySelector('#player-detail-name').textContent).toBe('second');
});
afterEach(() => { panels.forEach(panel => panel.destroy()); panels = []; });

function setup(supabase = null) {
  const panel = createPlayerDetailModal({
    supabase, normalizeBrowserPlayerCard: card => card, asArray: value => value ?? [],
    getCardImage: () => '', getCardRating: card => card.overall,
    getCardName: card => card.name, getPlayStyles: () => ['test'],
    createPlaystyleBadges: () => document.createElement('div'),
    getRoles: () => [], unwrapRelation: value => value,
  });
  panels.push(panel);
  return panel;
}

test('detail excludes the old exclusion controls', async () => {
  await setup().open({ id: 100, name: 'Test Player' });
  expect(document.querySelector('#player-detail-exclude')).toBeNull();
  expect(document.querySelector('.player-detail-exclusion')).toBeNull();
});

test('shared detail panel shows each selected card and closes with X or backdrop, restoring focus', async () => {
  const detail = setup();
  const trigger = document.createElement('button');
  document.body.append(trigger);
  for (const selector of ['#player-detail-close', '#player-detail-modal .modal-backdrop']) {
    trigger.focus();
    await detail.open({ id: selector, name: selector, primary_position: 'ST', overall: 90 });
    expect(detail.isOpen).toBe(true);
    expect(document.querySelector('#player-detail-name').textContent).toBe(selector);
    document.querySelector(selector).click();
    expect(detail.isOpen).toBe(false);
    expect(document.activeElement).toBe(trigger);
  }
});

test('a late response cannot overwrite another player or update the closed panel', async () => {
  const pending = [];
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    single: () => new Promise(resolve => pending.push(resolve)) };
  const detail = setup({ from: () => query });
  const first = detail.open({ id: 'a', name: 'First' });
  const second = detail.open({ id: 'b', name: 'Second' });
  expect(query.eq).toHaveBeenLastCalledWith('id', 'b');
  pending[0]({ data: { id: 'a', name: 'Stale first' } });
  await first;
  expect(document.querySelector('#player-detail-name').textContent).toBe('Second');
  detail.close();
  pending[1]({ data: { id: 'b', name: 'Late second' } });
  await second;
  expect(detail.isOpen).toBe(false);
  expect(document.querySelector('#player-detail-name').textContent).toBe('Second');
});
