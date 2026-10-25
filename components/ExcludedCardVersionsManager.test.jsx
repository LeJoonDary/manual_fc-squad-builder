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

test('selects gender with the existing special-limit button styles and retains it on reopen', async () => {
  const group = () => $('[aria-label="Max Female"]');
  expect(group().className).toBe('exclusion-special-options');
  for (const [label, value] of [['Exclude', 'exclude'], ...[1, 2, 3, 4, 5].map(n => [String(n), n]), ['Any', 'any']]) {
    await click([...group().querySelectorAll('button')].find(button => button.textContent === label));
    expect(excludedCardVersionsStore.getState().maxFemalePlayers).toBe(value);
    await click($('[aria-label="Close Excluded Cards"]'));
    await click($('.excluded-card-versions-toggle'));
    expect(group().querySelector('[aria-pressed="true"]').textContent).toBe(label);
  }
});

test.each(['exclude', 1, 2, 3, 4, 5])('counts %s everywhere and removes only the gender tag', async gender => {
  await act(async () => excludedCardVersionsStore.setMaxFemalePlayers(gender));
  expect($('#exclusion-manager-title').textContent).toBe('Excluded Cards (1)');
  expect($('.excluded-card-versions-toggle').textContent).toContain('Excluded Cards (1)');
  expect($('#exclusion-tab-excluded').textContent).toBe('Active Exclusions (1)');
  expect($('.settings-inline-clear').disabled).toBe(false);
  await act(async () => {
    excludedCardVersionsStore.ban('123', 'Test card');
    excludedCardVersionsStore.setMaxIcons(0);
    excludedCardVersionsStore.setMaxHeroes(2);
  });
  expect($('#exclusion-manager-title').textContent).toBe('Excluded Cards (4)');
  expect($('#exclusion-tab-excluded').textContent).toBe('Active Exclusions (4)');
  await click($('#exclusion-tab-excluded'));
  expect($('.exclusion-female-rule').textContent).toContain(gender === 'exclude' ? 'Exclude' : String(gender));
  await click($('[aria-label="Remove female player limit"]'));
  expect($('.exclusion-female-rule')).toBeNull();
  expect($('#exclusion-manager-title').textContent).toBe('Excluded Cards (3)');
  expect(excludedCardVersionsStore.getState()).toMatchObject({ maxFemalePlayers: 'any', excludedCardVersionIds: ['123'], maxIcons: 0, maxHeroes: 2 });
});

test.each(['.modal-header .exclusion-clear', '.exclusion-bulk-actions .exclusion-clear', '.settings-inline-clear'])('clears gender-only exclusions with %s without persistence', async selector => {
  await act(async () => excludedCardVersionsStore.setMaxFemalePlayers(3));
  if (selector.includes('bulk')) await click($('#exclusion-tab-excluded'));
  await click($(selector));
  expect(excludedCardVersionsStore.getState().maxFemalePlayers).toBe('any');
  expect(localStorage.getItem(EXCLUDED_CARD_VERSIONS_STORAGE_KEY)).toBeNull();
  expect($('#exclusion-manager-title').textContent).toBe('Excluded Cards (0)');
  expect($('.excluded-card-versions-toggle').textContent).toContain('Excluded Cards (0)');
  expect($('#exclusion-tab-excluded').textContent).toBe('Active Exclusions (0)');
  expect($('.settings-inline-clear').disabled).toBe(true);
  expect($('[aria-label="Max Female"] [aria-pressed="true"]').textContent).toBe('Any');
});

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
  expect(buttons[0].textContent).toBe('✅ Excluded');
  expect(buttons[1].textContent).toBe('🚫 Exclude');
  expect($('#exclusion-tab-excluded').textContent).toContain('(1)');
  expect(localStorage.getItem(EXCLUDED_CARD_VERSIONS_STORAGE_KEY)).toBeNull();
  await click($('#exclusion-tab-excluded'));
  expect(fetchExcludedCardDetails).not.toHaveBeenCalled(); // Reuse search details.
  expect($('#excluded-card-versions-list').textContent).toContain('TOTY');
  await click($('#exclusion-tab-search')); await click(buttons[0]);
  expect(excludedCardVersionsStore.getState().excludedCardVersionIds).toEqual([]);
});

test('short queries skip search and cancel a pending debounce', async () => {
  await type(' a '); await advance(400);
  expect(searchExclusionCards).not.toHaveBeenCalled();
  expect($('#exclusion-panel-search').textContent).toContain('at least 2 characters');
  await type('Messi'); await advance(299);
  await type('M'); await advance(400);
  expect(searchExclusionCards).not.toHaveBeenCalled();
});

test('header clear action is beside the title, separate from close, and hidden when empty', async () => {
  expect($('.exclusion-title-row .exclusion-clear')).toBeNull();
  await act(async () => excludedCardVersionsStore.ban(100, 'Saved card'));
  expect($('#exclusion-manager-title').nextElementSibling).toBe($('.exclusion-title-row .exclusion-clear'));
  expect($('.exclusion-title-row .modal-close')).toBeNull();
  await click($('.exclusion-title-row .exclusion-clear'));
  expect($('.exclusion-title-row .exclusion-clear')).toBeNull();
  expect($('[role="dialog"]')).not.toBeNull();
  expect(excludedCardVersionsStore.getState().excludedCardVersionIds).toEqual([]);
});

test('ignores stale search responses and cancels requests on close', async () => {
  let resolveOld;
  searchExclusionCards.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValueOnce([card(102, 'special_totw')]);
  await type('Old'); await advance(300);
  const oldSignal = searchExclusionCards.mock.calls[0][1].signal;
  await type('New'); await advance(300);
  expect(oldSignal.aborted).toBe(true);
  await act(async () => resolveOld([card(999, 'special_toty')]));
  expect($('#exclusion-panel-search').textContent).toContain('TOTW');
  expect($('#exclusion-panel-search').textContent).not.toContain('TOTY');
  const newSignal = searchExclusionCards.mock.calls[1][1].signal;
  await act(async () => $('#exclusion-card-search').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect($('[role="dialog"]')).toBeNull();
  expect(newSignal.aborted).toBe(true);
  expect(document.activeElement).toBe($('.excluded-card-versions-toggle'));
});

test('loads more without duplicates, retries failures at the same offset, and resets pagination on a new search', async () => {
  searchExclusionCards.mockResolvedValueOnce(Array.from({ length: 15 }, (_, i) => card(i)))
    .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([card(14), card(15)])
    .mockResolvedValueOnce([]);
  await type('Same'); await advance(300);
  await click($('.exclusion-load-more')); await advance(1);
  expect($('#exclusion-panel-search [role="alert"]').textContent).toContain('offline');
  await click($('#exclusion-panel-search [role="alert"] button')); await advance(1);
  expect(searchExclusionCards.mock.calls[2][1].offset).toBe(15);
  expect(document.querySelectorAll('.exclusion-toggle')).toHaveLength(16);
  expect($('.exclusion-load-more')).toBeNull();
  await type('Nobody'); await advance(300);
  expect(searchExclusionCards.mock.calls[3][1].offset).toBe(0);
  expect($('#exclusion-panel-search').textContent).toContain('No results found');
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
  expect($('#exclusion-tab-excluded').textContent).toContain('(0)');
  expect(localStorage.getItem(EXCLUDED_CARD_VERSIONS_STORAGE_KEY)).toBeNull();
  expect($('#excluded-card-versions-list').textContent).toContain('No cards currently excluded.');
});

test('database and storage failures do not prevent in-memory removal', async () => {
  await act(async () => excludedCardVersionsStore.ban(100, 'Saved card'));
  fetchExcludedCardDetails.mockRejectedValue(new Error('offline'));
  await click($('#exclusion-tab-excluded'));
  expect($('#exclusion-panel-excluded [role="alert"]').textContent).toContain('offline');
  await click($('.exclusion-select-all input'));
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await click($('.exclusion-clear'));
  expect(excludedCardVersionsStore.getState().excludedCardVersionIds).toEqual([]);
  expect(storage).not.toHaveBeenCalled();
  storage.mockRestore();
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
  expect($('input[aria-label="Min OVR slider"]').value).toBe('80');
  await setInput('input[aria-label="Max OVR slider"]', '70');
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
  await click([...document.querySelectorAll('button')].find(button => button.textContent === 'Reset OVR Range'));
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
    'Max 64 (Bronze)', 'Max 74 (Silver & Below)', 'Min 75 (Gold & Above)', 'Reset OVR Range',
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
  expect($('.exclusion-ovr-rule').textContent).toContain('OVR ' + label + ' only in squad');
  expect($('#exclusion-tab-excluded').textContent).toBe('Active Exclusions (2)');
  await click($('.exclusion-ovr-rule button'));
  expect($('#exclusion-tab-excluded').textContent).toBe('Active Exclusions (1)');
  expectOvrInputs(45, 99);
  expect($('.exclusion-ovr-rule')).toBeNull();
  expect(excludedCardVersionsStore.getState().squadOvrRange).toEqual({ min: 45, max: 99 });
  expect(excludedCardVersionsStore.getState().excludedCardVersionIds).toEqual(['123']);
  expect(localStorage.getItem(EXCLUDED_CARD_VERSIONS_STORAGE_KEY)).toBeNull();
  expect([...document.querySelectorAll('.exclusion-ovr-chips button[aria-pressed]')].every(button => button.getAttribute('aria-pressed') === 'false')).toBe(true);
});

function expectOvrInputs(min, max) {
  expect($('#exclusion-ovr-min').value).toBe(String(min));
  expect($('#exclusion-ovr-max').value).toBe(String(max));
  expect($('input[aria-label="Min OVR slider"]').value).toBe(String(min));
  expect($('input[aria-label="Max OVR slider"]').value).toBe(String(max));
}

test('reset clears draft inputs even when the saved range is already default', async () => {
  await setInput('#exclusion-ovr-min', '60');
  await setInput('#exclusion-ovr-max', '80');
  await click(document.querySelectorAll('.exclusion-ovr-chips button')[3]);
  expectOvrInputs(45, 99);
  expect($('#exclusion-tab-excluded').textContent).toBe('Active Exclusions (0)');
});

test('saved ranges initialize on reopen, external changes sync, and unrelated bans preserve drafts', async () => {
  await click(document.querySelectorAll('.exclusion-ovr-chips button')[1]);
  expect($('#exclusion-tab-excluded').textContent).toBe('Active Exclusions (1)');
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
    expect($('.excluded-card-versions-toggle .settings-trigger-label').textContent).toBe('Excluded Cards (' + excludedCardVersionsStore.getState().excludedCardVersionIds.length + ')');
    expect($('#exclusion-tab-excluded').textContent).toBe('Active Exclusions (' + count + ')');
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
  expect($('.excluded-card-versions-toggle .settings-trigger-label').textContent).toBe('Excluded Cards (0)');
  await click($('.excluded-card-versions-toggle'));
  expectCounts(1);
});

 test('removes individual cards and clears all from the header while preserving OVR rules', async () => {
  await act(async () => {
    excludedCardVersionsStore.ban('1', 'First');
    excludedCardVersionsStore.ban('2', 'Second');
    excludedCardVersionsStore.setSquadOvrRange({ min: 80, max: 99 });
  });
  await click($('#exclusion-tab-excluded'));
  await click($('[aria-label="Remove exclusion for First"]'));
  expect(excludedCardVersionsStore.getState().excludedCardVersionIds).toEqual(['2']);
  expect($('#exclusion-manager-title').textContent).toBe('Excluded Cards (1)');
  await click($('.modal-header .exclusion-clear'));
  expect(excludedCardVersionsStore.getState().excludedCardVersionIds).toEqual([]);
  expect(excludedCardVersionsStore.getState().squadOvrRange.min).toBe(80);
  expect($('#excluded-card-versions-list').textContent).toContain('No cards currently excluded.');
  expect($('.settings-inline-clear').disabled).toBe(true);
 });

test('selects independent special limits with accessible pressed states', async () => {
  const icons = $('[role="group"][aria-label="Max Icons"]');
  const heroes = $('[role="group"][aria-label="Max Heroes"]');
  expect(icons.querySelector('[aria-pressed="true"]').textContent).toBe('Any');
  await click([...icons.querySelectorAll('button')].find(button => button.textContent === 'Exclude'));
  await click([...heroes.querySelectorAll('button')].find(button => button.textContent === '5'));
  expect(excludedCardVersionsStore.getState()).toMatchObject({ maxIcons: 0, maxHeroes: 5 });
  expect(icons.querySelector('[aria-pressed="true"]').classList.contains('is-exclude')).toBe(true);
  await act(async () => excludedCardVersionsStore.reset());
  expect(icons.querySelector('[aria-pressed="true"]').textContent).toBe('Any');
  expect(heroes.querySelector('[aria-pressed="true"]').textContent).toBe('Any');
});

test('counts special limits in both titles and clears them with the panel trash button', async () => {
  await act(async () => {
    excludedCardVersionsStore.setMaxIcons(0);
    excludedCardVersionsStore.setMaxHeroes(1);
  });
  expect($('#exclusion-manager-title').textContent).toBe('Excluded Cards (2)');
  expect($('.excluded-card-versions-toggle').textContent).toContain('Excluded Cards (2)');
  expect($('.settings-inline-clear').disabled).toBe(false);
  await click($('.settings-inline-clear'));
  expect(excludedCardVersionsStore.getState()).toMatchObject({ excludedCardVersionIds: [], maxIcons: null, maxHeroes: null });
  expect($('#exclusion-manager-title').textContent).toBe('Excluded Cards (0)');
  expect($('.settings-inline-clear').disabled).toBe(true);
});
test('modal Clear All clears cards and special limits while preserving the OVR range', async () => {
  await act(async () => {
    excludedCardVersionsStore.ban(100, 'Test');
    excludedCardVersionsStore.setMaxIcons(5);
    excludedCardVersionsStore.setSquadOvrRange({ min: 80, max: 99 });
  });
  expect($('#exclusion-manager-title').textContent).toBe('Excluded Cards (2)');
  await click($('.exclusion-title-row .exclusion-clear'));
  expect(excludedCardVersionsStore.getState()).toMatchObject({ excludedCardVersionIds: [], maxIcons: null, maxHeroes: null, squadOvrRange: { min: 80, max: 99 } });
});
