// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createPlaystyleIcons } from './PlaystyleIcons.js';

test('uses exact level images, sorts Plus first, skips missing images and supports tooltip inspection', () => {
  const parent = document.createElement('article');
  const activate = vi.fn();
  parent.addEventListener('click', activate);
  parent.addEventListener('keydown', activate);
  const icons = createPlaystyleIcons([
    { name: 'Rapid', isPlus: false, image_url: '/silver.png', image_url_plus: '/unused.png' },
    { name: 'Finesse Shot', isPlus: true, image_url: '/unused.png', image_url_plus: '/gold.png' },
    { name: 'Flair', isPlus: false },
  ]);
  parent.append(icons);
  document.body.append(parent);
  const [plus, normal] = icons.querySelectorAll('button');
  expect(icons.querySelectorAll('button')).toHaveLength(2);
  expect(plus.getAttribute('aria-label')).toBe('Finesse Shot+');
  expect(plus.querySelector('img').getAttribute('src')).toBe('/gold.png');
  expect(normal.querySelector('img').getAttribute('src')).toBe('/silver.png');
  plus.click();
  expect(activate).not.toHaveBeenCalled();
  const tooltip = document.getElementById(plus.getAttribute('aria-describedby'));
  expect(tooltip.textContent).toBe('Finesse Shot+');
  expect(tooltip.hidden).toBe(false);
  plus.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(activate).not.toHaveBeenCalled();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(tooltip.hidden).toBe(true);
  normal.focus();
  expect(tooltip.textContent).toBe('Rapid');
  expect(tooltip.hidden).toBe(false);
  normal.querySelector('img').dispatchEvent(new Event('error'));
  expect(icons.querySelectorAll('button')).toHaveLength(1);
  expect(tooltip.hidden).toBe(true);
  parent.remove();
});
