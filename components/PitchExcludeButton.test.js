// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createPitchExcludeButton, syncPitchExclusions } from './PitchExcludeButton.js';
import { excludedCardVersionsStore as store } from '../utils/excludedCardVersions.js';
import { setLanguage } from '../src/i18n/languageStore';
import { mountDomTranslations } from '../src/i18n/domTranslations';
import { setCardAction } from '../src/i18n/cardActions';
import { translations } from '../src/locales/translations';

test('pitch exclusion toggles the shared store, notifies, and follows manager changes', () => {
  setLanguage('en', false);
  vi.useFakeTimers();
  const unsubscribe = store.subscribe(syncPitchExclusions);
  const button = createPitchExcludeButton({ id: 234, name: 'Test', version: 'Gold' });
  const parent = document.createElement('div');
  parent.className = 'slot';
  const activate = vi.fn();
  parent.addEventListener('click', activate);
  parent.append(button);
  document.body.append(parent);
  button.click();
  expect(store.getState().excludedCardVersionIds).toContain('234');
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(parent.classList.contains('is-excluded')).toBe(true);
  expect(document.querySelector('#pitch-action-toast').dataset.tone).toBe('warning');
  expect(document.querySelector('#pitch-action-toast').textContent).toContain('Excluded from auto build.');
  expect(activate).not.toHaveBeenCalled();
  store.unban('234');
  expect(button.getAttribute('aria-pressed')).toBe('false');
  expect(parent.classList.contains('is-excluded')).toBe(false);
  button.click(); button.click();
  expect(store.getState().excludedCardVersionIds).not.toContain('234');
  expect(document.querySelector('#pitch-action-toast').dataset.tone).toBe('success');
  expect(document.querySelector('#pitch-action-toast').textContent).toBe('Removed from auto build exclusions.');
  vi.runAllTimers();
  expect(document.querySelector('#pitch-action-toast').hidden).toBe(true);
  unsubscribe(); parent.remove(); vi.useRealTimers();
});

test('card action tooltips follow language and state changes without translating Playstyles or Roles', async () => {
  setLanguage('ko', false);
  const parent = document.createElement('div');
  parent.innerHTML = '<span class="role-name-chip">Box to Box</span><span class="playstyle-badge">Pinged Pass</span>';
  document.body.append(parent);
  const stop = mountDomTranslations(parent);
  try {
    for (const key of Object.keys(translations.en.cardActions)) {
      const button = document.createElement('button');
      setCardAction(button, key);
      parent.append(button);
      expect(button.title).toBe(translations.ko.cardActions[key]);
      expect(button.dataset.tooltip).toBe(button.title);
      expect(button.getAttribute('aria-label')).toBe(button.title);
    }
    setLanguage('en', false);
    for (const button of parent.querySelectorAll('button')) {
      expect(button.title).toBe(translations.en.cardActions[button.dataset.i18nCardAction]);
      expect(button.dataset.tooltip).toBe(button.title);
    }
    const button = parent.querySelector('button');
    setCardAction(button, 'unlock');
    setLanguage('ko', false);
    await Promise.resolve();
    expect(button.dataset.tooltip).toBe('잠금 해제');
    expect(parent.querySelector('.role-name-chip').textContent).toBe('Box to Box');
    expect(parent.querySelector('.playstyle-badge').textContent).toBe('Pinged Pass');
  } finally { stop(); parent.remove(); setLanguage('en', false); }
});

test('exclusion toasts and existing buttons switch between Korean and English', async () => {
  vi.useFakeTimers();
  setLanguage('ko', false);
  store.unban('345');
  const unsubscribe = store.subscribe(syncPitchExclusions);
  const stop = mountDomTranslations();
  const button = createPitchExcludeButton({ id: 345, name: 'Test', version: 'Gold' });
  document.body.append(button);
  try {
    expect(button.title).toBe(translations.ko.cardActions.exclude);
    button.click();
    const toast = document.querySelector('#pitch-action-toast');
    expect(toast.textContent).toBe(translations.ko.toasts.excludedSuccess);
    expect(button.title).toBe(translations.ko.cardActions.removeExclusion);
    setLanguage('en', false);
    await Promise.resolve();
    expect(toast.textContent).toBe(translations.en.toasts.excludedSuccess);
    expect(button.title).toBe(translations.en.cardActions.removeExclusion);
    button.click();
    expect(toast.textContent).toBe(translations.en.toasts.excludedRemoved);
    setLanguage('ko', false);
    await Promise.resolve();
    expect(toast.textContent).toBe(translations.ko.toasts.excludedRemoved);
    expect(button.title).toBe(translations.ko.cardActions.exclude);
    vi.runAllTimers();
    expect(toast.hidden).toBe(true);
  } finally {
    stop(); unsubscribe(); button.remove(); document.querySelector('#pitch-action-toast')?.remove();
    setLanguage('en', false); vi.useRealTimers();
  }
});
