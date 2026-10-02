// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createPitchExcludeButton, syncPitchExclusions } from './PitchExcludeButton.js';
import { excludedCardVersionsStore as store } from '../utils/excludedCardVersions.js';

test('pitch exclusion toggles the shared store, notifies, and follows manager changes', () => {
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
