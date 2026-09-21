// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { ExcludedCardVersionsManager } from './ExcludedCardVersionsManager.jsx';
import { excludedCardVersionsStore, EXCLUDED_CARD_VERSIONS_STORAGE_KEY } from '../utils/excludedCardVersions.js';
import { searchExclusionCards, fetchExcludedCardDetails } from '../utils/exclusionCardSearch.js';

vi.mock('../utils/exclusionCardSearch.js', async original => ({
  ...await original(), searchExclusionCards: vi.fn(), fetchExcludedCardDetails: vi.fn(),
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
const db = {};
const card = (id, version = 'Gold') => ({ id, version, overall: 90, image_url: 'https://example.com/portrait.png',
  background_url: 'https://example.com/gold.png', players: { id: 7, name: 'Same Player', long_name: 'Same Full Player' } });
const $ = selector => document.querySelector(selector);
const click = async element => act(async () => element.click());
const advance = async ms => act(async () => vi.advanceTimersByTimeAsync(ms));
async function type(value) {
  await act(async () => {
    const input = $('#exclusion-card-search');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(async () => {
  vi.useFakeTimers(); vi.resetAllMocks(); excludedCardVersionsStore.clear();
  searchExclusionCards.mockResolvedValue([]); fetchExcludedCardDetails.mockResolvedValue([]);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<ExcludedCardVersionsManager supabase={db} />));
  $('.excluded-card-versions-toggle').focus();
  await click($('.excluded-card-versions-toggle'));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

test('debounces independent name search and toggles only the selected version with live counts', async () => {
  searchExclusionCards.mockResolvedValue([card(100, 'TOTY'), card(101)]);
  await type('Sa'); await advance(200); await type('Same'); await advance(299);
  expect(searchExclusionCards).not.toHaveBeenCalled();
  await advance(1);
  expect(searchExclusionCards).toHaveBeenCalledTimes(1);
  expect(searchExclusionCards.mock.calls[0][1]).toMatchObject({ keyword: 'Same', offset: 0 });
  const buttons = document.querySelectorAll('.exclusion-toggle');
  expect(document.querySelectorAll('.exclusion-card-art img')).toHaveLength(2);
  expect($('.exclusion-card-art').style.backgroundImage).toContain('gold.png');
  await click(buttons[0]);
  expect(buttons[0].textContent).toBe('✅ 제외됨');
  expect(buttons[1].textContent).toBe('🚫 제외하기');
  expect($('#exclusion-tab-excluded').textContent).toContain('(1개)');
  expect(JSON.parse(localStorage.getItem(EXCLUDED_CARD_VERSIONS_STORAGE_KEY)).excludedCardVersionIds).toEqual(['100']);
  await click($('#exclusion-tab-excluded'));
  expect(fetchExcludedCardDetails).not.toHaveBeenCalled(); // Reuse search details.
  expect($('#excluded-card-versions-list').textContent).toContain('TOTY');
  await click($('#exclusion-tab-search')); await click(buttons[0]);
  expect(excludedCardVersionsStore.getState().excludedCardVersionIds).toEqual([]);
});

test('ignores stale search responses and cancels requests on close', async () => {
  let resolveOld;
  searchExclusionCards.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValueOnce([card(102)]);
  await type('Old'); await advance(300);
  const oldSignal = searchExclusionCards.mock.calls[0][1].signal;
  await type('New'); await advance(300);
  expect(oldSignal.aborted).toBe(true);
  await act(async () => resolveOld([card(999)]));
  expect($('#exclusion-panel-search').textContent).toContain('#102');
  expect($('#exclusion-panel-search').textContent).not.toContain('#999');
  const newSignal = searchExclusionCards.mock.calls[1][1].signal;
  await act(async () => $('#exclusion-card-search').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect($('[role="dialog"]')).toBeNull();
  expect(newSignal.aborted).toBe(true);
  expect(document.activeElement).toBe($('.excluded-card-versions-toggle'));
});

test('loads more without duplicates, retries failures at the same offset, and resets pagination on a new search', async () => {
  searchExclusionCards.mockResolvedValueOnce(Array.from({ length: 30 }, (_, i) => card(i)))
    .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([card(29), card(30)])
    .mockResolvedValueOnce([]);
  await type('Same'); await advance(300);
  await click($('.exclusion-load-more')); await advance(1);
  expect($('#exclusion-panel-search [role="alert"]').textContent).toContain('offline');
  await click($('#exclusion-panel-search [role="alert"] button')); await advance(1);
  expect(searchExclusionCards.mock.calls[2][1].offset).toBe(30);
  expect(document.querySelectorAll('.exclusion-toggle')).toHaveLength(31);
  expect($('.exclusion-load-more')).toBeNull();
  await type('Nobody'); await advance(300);
  expect(searchExclusionCards.mock.calls[3][1].offset).toBe(0);
  expect($('#exclusion-panel-search').textContent).toContain('검색 결과가 없습니다');
});

test('loads saved details, supports partial/all selection, bulk unban and reset', async () => {
  await act(async () => { [100, 101, 102].forEach(id => excludedCardVersionsStore.ban(id, `Saved #${id}`)); });
  fetchExcludedCardDetails.mockResolvedValue([card(100, 'TOTY'), card(101)]); // A deleted DB row stays removable.
  await click($('#exclusion-tab-excluded'));
  expect(fetchExcludedCardDetails.mock.calls[0][1]).toEqual(['100', '101', '102']);
  expect($('#excluded-card-versions-list').textContent).toContain('Saved #102');
  await click($('#excluded-card-versions-list input'));
  expect($('.exclusion-select-all input').indeterminate).toBe(true);
  await click($('.exclusion-bulk-actions button'));
  expect(excludedCardVersionsStore.getState().excludedCardVersionIds).toEqual(['101', '102']);
  await click($('.exclusion-select-all input'));
  expect([...document.querySelectorAll('#excluded-card-versions-list input')].every(node => node.checked)).toBe(true);
  await click($('.exclusion-select-all input'));
  expect($('.exclusion-bulk-actions button').disabled).toBe(true);
  await click($('.exclusion-clear'));
  expect($('#exclusion-tab-excluded').textContent).toContain('(0개)');
  expect(JSON.parse(localStorage.getItem(EXCLUDED_CARD_VERSIONS_STORAGE_KEY)).excludedCardVersionIds).toEqual([]);
  expect($('#excluded-card-versions-list').textContent).toContain('제외된 카드가 없습니다');
});

test('database failures still allow removal and storage failures retain selected cards', async () => {
  await act(async () => excludedCardVersionsStore.ban(100, 'Saved card'));
  fetchExcludedCardDetails.mockRejectedValue(new Error('offline'));
  await click($('#exclusion-tab-excluded'));
  expect($('#exclusion-panel-excluded [role="alert"]').textContent).toContain('offline');
  await click($('.exclusion-select-all input'));
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await click($('.exclusion-clear'));
  expect(excludedCardVersionsStore.getState().excludedCardVersionIds).toEqual(['100']);
  expect($('.exclusion-action-message[role="alert"]').textContent).toContain('저장하지 못했습니다');
  storage.mockRestore();
  await click($('.exclusion-bulk-actions button'));
  expect(excludedCardVersionsStore.getState().excludedCardVersionIds).toEqual([]);
});
