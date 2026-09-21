// @vitest-environment jsdom
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import html from '../index.html?raw';
import { createPlayerDetailModal } from './PlayerDetailModal.js';
import { excludedCardVersionsStore, EXCLUDED_CARD_VERSIONS_STORAGE_KEY } from '../utils/excludedCardVersions.js';

let panels = [];
beforeEach(() => {
  for (const id of excludedCardVersionsStore.getState().excludedCardVersionIds) excludedCardVersionsStore.unban(id);
  document.body.innerHTML = html;
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

test('detail button bans only its card version and reflects unban from another UI', async () => {
  const detail = setup();
  const button = document.querySelector('#player-detail-exclude');
  await detail.open({ id: 100, name: 'Test Player', version: 'TOTY', raw: { id: 100, player_id: 7 } });
  button.click();
  expect(excludedCardVersionsStore.getState().excludedCardVersionIds).toEqual(['100']);
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(JSON.parse(localStorage.getItem(EXCLUDED_CARD_VERSIONS_STORAGE_KEY)).excludedCardVersionNames['100']).toBe('Test Player · TOTY (#100)');
  detail.close();
  await detail.open({ id: 101, name: 'Test Player', version: 'Gold', player_id: 7 });
  expect(button.getAttribute('aria-pressed')).toBe('false');
  button.click();
  expect(excludedCardVersionsStore.getState().excludedCardVersionIds).toEqual(['100', '101']);
  expect(excludedCardVersionsStore.getState().excludedCardVersionNames['101']).toContain('Gold');
  button.click();
  await detail.open({ id: 100, name: 'Test Player', version: 'TOTY', player_id: 7 });
  expect(button.textContent).toContain('제외됨');
  excludedCardVersionsStore.unban(100);
  expect(button.getAttribute('aria-pressed')).toBe('false');
  button.click();
  button.click();
  expect(excludedCardVersionsStore.getState().excludedCardVersionIds).toEqual([]);
  await detail.open({ player_id: 7, name: 'Missing card identity' });
  expect(button.disabled).toBe(true);
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
