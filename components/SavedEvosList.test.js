// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createSavedEvosList } from './SavedEvosList.js';
import { savedEvosStore, SAVED_EVOS_KEY } from '../utils/savedEvos.js';
import { setLanguage } from '../src/i18n/languageStore';

test('additional positions enable selection, mismatches sort last, delete never selects', () => {
  setLanguage('en', false);
  localStorage.setItem(SAVED_EVOS_KEY, JSON.stringify([
    { id: '1', player: { id: 1, name: 'Defender', primary_position: 'CB' }, customOverrides: { overall: 95 }, savedAt: 3 },
    { id: '2', player: { id: 2, name: 'Evo Striker', primary_position: 'CM', sm: 4, wf: 5 }, customOverrides: { addedPositions: ['ST'], forceFullChem: true, overall: 99 }, savedAt: 2 },
  ]));
  savedEvosStore.load();
  const select = vi.fn();
  const list = createSavedEvosList({ position: 'ST', select });
  const buttons = list.querySelectorAll('.saved-evo-select');
  expect(buttons[0].disabled).toBe(false); expect(buttons[0].textContent).toContain('Evo Striker');
  expect(buttons[0].textContent).toContain('3✦'); expect(buttons[0].textContent).toContain('99');
  expect(buttons[1].disabled).toBe(true); expect(buttons[1].textContent).toContain('Position mismatch');
  list.querySelector('.saved-evo-delete').click(); expect(select).not.toHaveBeenCalled();
  expect(savedEvosStore.entries.map(item => item.id)).toEqual(['1']);
  setLanguage('ko', false);
  expect(createSavedEvosList({ position: 'ST', select }).textContent).toContain('포지션 불일치');
});
