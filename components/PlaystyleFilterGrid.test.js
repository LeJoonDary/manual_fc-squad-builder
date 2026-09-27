// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { renderPlaystyleGrid } from './PlaystyleFilterGrid.js';
import { createDefaultFilters } from '../utils/playerFilters.js';
import { matchesPlaystyleFilters } from '../utils/playstyleFilters.js';

test('groups icons, keeps Plus above Normal and toggles each level independently', () => {
  const container = document.createElement('div');
  const filters = createDefaultFilters();
  let changes = 0;
  renderPlaystyleGrid(container, [
    { id: 7, name: 'Finesse Shot', category: 'Shooting', image_url: '/silver.png', image_url_plus: '/gold.png' },
    { id: 8, name: 'Chip Shot', category: 'Shooting', image_url: null },
    { id: 9, name: 'Power Header', category: 'Shooting', image_url: '/silver.png', image_url_plus: null },
    { id: 10, name: 'Trivela', category: 'Passing', image_url: '', image_url_plus: '/gold.png' },
  ], filters, () => changes++);
  expect([...container.querySelectorAll('h3')].map(el => el.textContent)).toEqual([
    'Shooting',
  ]);
  const [plus, normal] = container.querySelectorAll('button');
  expect(container.querySelectorAll('button')).toHaveLength(2);
  expect(plus.querySelector('img').getAttribute('src')).toBe('/gold.png');
  plus.click(); normal.click();
  expect(filters.selectedNormalIds).toEqual([7]);
  expect(filters.selectedPlusIds).toEqual([7]);
  const rows = [{ playstyle_id: 7, is_plus: false }];
  expect(matchesPlaystyleFilters(rows, filters)).toBe(true);
  filters.requireAllPlaystyles = true;
  expect(matchesPlaystyleFilters(rows, filters)).toBe(false);
  expect(matchesPlaystyleFilters([...rows, { playstyle_id: 7, is_plus: true }], filters)).toBe(true);
  plus.click();
  expect(filters.selectedPlusIds).toEqual([]);
  expect(normal.getAttribute('aria-pressed')).toBe('true');
  expect(plus.getAttribute('aria-pressed')).toBe('false');
  expect(changes).toBe(3);
});
