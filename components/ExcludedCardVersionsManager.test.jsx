// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { ExcludedCardVersionsManager } from './ExcludedCardVersionsManager.jsx';
import { excludedCardVersionsStore, EXCLUDED_CARD_VERSIONS_STORAGE_KEY } from '../utils/excludedCardVersions.js';
import { searchExclusionCards, fetchExcludedCardDetails, fetchExclusionCardIdsByOvr } from '../utils/exclusionCardSearch.js';

vi.mock('../utils/exclusionCardSearch.js', async original => ({
  ...await original(), searchExclusionCards: vi.fn(), fetchExcludedCardDetails: vi.fn(), fetchExclusionCardIdsByOvr: vi.fn(),
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
  vi.useFakeTimers(); vi.resetAllMocks(); excludedCardVersionsStore.clear(); excludedCardVersionsStore.setSquadOvrRange({ min: 45, max: 99 });
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

async function setInput(selector, value) {
  await act(async () => {
    const input = $(selector);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

test('OVR presets and range/number inputs stay synchronized and invalid ranges cannot execute', async () => {
  expect($('#exclusion-ovr-min').value).toBe('45');
  expect($('#exclusion-ovr-max').value).toBe('99');
  const chips = document.querySelectorAll('.exclusion-ovr-chips button');
  for (const [index, min, max] of [[0, '45', '64'], [1, '45', '74'], [2, '75', '99']]) {
    await click(chips[index]);
    expect($('#exclusion-ovr-min').value).toBe(min);
    expect($('#exclusion-ovr-max').value).toBe(max);
  }
  await setInput('#exclusion-ovr-min', '80');
  expect($('input[aria-label="최소 OVR 슬라이더"]').value).toBe('80');
  await setInput('input[aria-label="최대 OVR 슬라이더"]', '70');
  expect($('#exclusion-ovr-max').value).toBe('70');
  expect($('#exclusion-ovr-min').value).toBe('70');
  for (const value of ['', '44', '100', '70.5', '90']) {
    await setInput('#exclusion-ovr-min', value);
    expect($('.exclusion-ovr-submit').disabled).toBe(true);
  }
});

test('OVR actions set candidate bounds immediately without fetching or storing thousands of IDs', async () => {
  await act(async () => excludedCardVersionsStore.ban('1', 'Existing'));
  const chips = document.querySelectorAll('.exclusion-ovr-chips button');
  for (const [index, range] of [[0, { min: 45, max: 64 }], [1, { min: 45, max: 74 }], [2, { min: 75, max: 99 }]]) {
    await click(chips[index]);
    expect(excludedCardVersionsStore.getState().squadOvrRange).toEqual(range);
  }
  await setInput('#exclusion-ovr-min', '45');
  await setInput('#exclusion-ovr-max', '79');
  await click($('.exclusion-ovr-submit'));
  expect(excludedCardVersionsStore.getState().squadOvrRange).toEqual({ min: 45, max: 79 });
  expect(excludedCardVersionsStore.getState().excludedCardVersionIds).toEqual(['1']);
  expect(fetchExclusionCardIdsByOvr).not.toHaveBeenCalled();
  expect($('#exclusion-card-search').compareDocumentPosition($('.exclusion-ovr')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await click([...document.querySelectorAll('button')].find(button => button.textContent === 'OVR 범위 초기화'));
  expect(excludedCardVersionsStore.getState().squadOvrRange).toEqual({ min: 45, max: 99 });
});

test('middle, single-value and full target ranges are supported', async () => {
  for (const [min, max] of [[60, 80], [75, 75], [45, 99]]) {
    await setInput('#exclusion-ovr-min', String(min));
    await setInput('#exclusion-ovr-max', String(max));
    await click($('.exclusion-ovr-submit'));
    expect($('.exclusion-action-message[role="alert"]')).toBeNull();
    expect(excludedCardVersionsStore.getState().squadOvrRange).toEqual({ min, max });
  }
  expect(fetchExclusionCardIdsByOvr).not.toHaveBeenCalled();
});

 test('quick actions show explicit inclusion labels with reset alongside them', () => {
  expect([...document.querySelectorAll('.exclusion-ovr-chips button')].map(button => button.textContent)).toEqual([
    'OVR 64 이하만 (브론즈)', 'OVR 74 이하만 (실버 이하)', 'OVR 75 이상만 (골드 이상)', 'OVR 범위 초기화',
  ]);
});

test.each([
  [{ min: 75, max: 99 }, '75 ~ 99'],
  [{ min: 45, max: 74 }, '45 ~ 74'],
  [{ min: 65, max: 90 }, '65 ~ 90'],
])('excluded tab displays the target OVR range and cancels only the range: %s', async (range, label) => {
  expect($('.exclusion-ovr-rule')).toBeNull();
  await act(async () => {
    excludedCardVersionsStore.ban('123', 'Individual');
    excludedCardVersionsStore.setSquadOvrRange(range);
  });
  await click($('#exclusion-tab-excluded'));
  expect($('#exclusion-panel-excluded').firstElementChild).toBe($('.exclusion-ovr-rule'));
  expect($('.exclusion-ovr-rule').textContent).toContain('OVR ' + label + '만 스쿼드에 포함');
  expect($('#exclusion-tab-excluded').textContent).toBe('현재 제외 및 범위 설정 (2개)');
  await click($('.exclusion-ovr-rule button'));
  expect($('#exclusion-tab-excluded').textContent).toBe('현재 제외 및 범위 설정 (1개)');
  expectOvrInputs(45, 99);
  expect($('.exclusion-ovr-rule')).toBeNull();
  expect(excludedCardVersionsStore.getState().squadOvrRange).toEqual({ min: 45, max: 99 });
  expect(excludedCardVersionsStore.getState().excludedCardVersionIds).toEqual(['123']);
  expect(JSON.parse(localStorage.getItem(EXCLUDED_CARD_VERSIONS_STORAGE_KEY)).squadOvrRange).toEqual({ min: 45, max: 99 });
  expect([...document.querySelectorAll('.exclusion-ovr-chips button[aria-pressed]')].every(button => button.getAttribute('aria-pressed') === 'false')).toBe(true);
});

function expectOvrInputs(min, max) {
  expect($('#exclusion-ovr-min').value).toBe(String(min));
  expect($('#exclusion-ovr-max').value).toBe(String(max));
  expect($('input[aria-label="최소 OVR 슬라이더"]').value).toBe(String(min));
  expect($('input[aria-label="최대 OVR 슬라이더"]').value).toBe(String(max));
}

test('reset clears draft inputs even when the saved range is already default', async () => {
  await setInput('#exclusion-ovr-min', '60');
  await setInput('#exclusion-ovr-max', '80');
  await click(document.querySelectorAll('.exclusion-ovr-chips button')[3]);
  expectOvrInputs(45, 99);
  expect($('#exclusion-tab-excluded').textContent).toBe('현재 제외 및 범위 설정 (0개)');
});

test('saved ranges initialize on reopen, external changes sync, and unrelated bans preserve drafts', async () => {
  await click(document.querySelectorAll('.exclusion-ovr-chips button')[1]);
  expect($('#exclusion-tab-excluded').textContent).toBe('현재 제외 및 범위 설정 (1개)');
  await click($('.modal-close'));
  await click($('.excluded-card-versions-toggle'));
  expectOvrInputs(45, 74);
  await setInput('#exclusion-ovr-min', '60');
  await act(async () => excludedCardVersionsStore.ban('123', 'Individual'));
  expectOvrInputs(60, 74);
  await act(async () => excludedCardVersionsStore.setSquadOvrRange({ min: 45, max: 99 }));
  expectOvrInputs(45, 99);
});

test('main button and modal count stay synchronized through range and individual card changes', async () => {
  const expectCounts = count => {
    expect($('.excluded-card-versions-toggle').textContent).toBe('🚫 제외 카드 관리 (' + count + ')');
    expect($('#exclusion-tab-excluded').textContent).toBe('현재 제외 및 범위 설정 (' + count + '개)');
  };
  expectCounts(0);
  await click(document.querySelectorAll('.exclusion-ovr-chips button')[0]);
  expectCounts(1);
  await act(async () => excludedCardVersionsStore.ban('123', 'Individual'));
  expectCounts(2);
  await click(document.querySelectorAll('.exclusion-ovr-chips button')[2]);
  expectCounts(2);
  await click($('#exclusion-tab-excluded'));
  await click($('.exclusion-ovr-rule button'));
  expectCounts(1);
  await act(async () => excludedCardVersionsStore.unban('123'));
  expectCounts(0);
  await click($('.modal-close'));
  await act(async () => excludedCardVersionsStore.setSquadOvrRange({ min: 60, max: 80 }));
  expect($('.excluded-card-versions-toggle').textContent).toBe('🚫 제외 카드 관리 (1)');
  await click($('.excluded-card-versions-toggle'));
  expectCounts(1);
});
