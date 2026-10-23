// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createMobileFiltersToggle } from './MobileFiltersToggle.js';

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

function setup() {
  let resize;
  const media = { matches: true, addEventListener: (_, listener) => { resize = listener; } };
  vi.stubGlobal('matchMedia', query => query.includes('768') ? media : { matches: true });
  document.body.innerHTML = '<button aria-controls="filters"></button><aside id="filters"></aside>';
  const button = document.querySelector('button');
  const panel = document.querySelector('aside');
  const closePopovers = vi.fn();
  const toggle = createMobileFiltersToggle({ button, panel, closePopovers });
  return { button, panel, toggle, closePopovers, resize: matches => { media.matches = matches; resize(); } };
}

it('starts expanded and toggles access to filters without clearing selected filters', () => {
  const { button, panel, toggle, closePopovers } = setup();
  expect(button.getAttribute('aria-expanded')).toBe('true');
  toggle.updateCount(2);
  button.click();
  expect(button.textContent).toBe('Filters (2) ▼ (Show)');
  expect(panel.inert).toBe(true);
  expect(closePopovers).toHaveBeenCalledOnce();
  toggle.updateCount(0);
  expect(button.textContent).toBe('Filters ▼ (Show)');
  button.click();
  expect(panel.inert).toBe(false);
  expect(panel.classList.contains('is-mobile-collapsed')).toBe(false);
});

it('always expands on desktop and restores the mobile preference on return', () => {
  const { button, panel, resize } = setup();
  button.click();
  resize(false);
  expect(panel.inert).toBe(false);
  expect(panel.classList.contains('is-mobile-collapsed')).toBe(false);
  expect(button.getAttribute('aria-expanded')).toBe('true');
  button.click();
  expect(panel.classList.contains('is-mobile-collapsed')).toBe(false);
  resize(true);
  expect(panel.inert).toBe(true);
  expect(button.getAttribute('aria-expanded')).toBe('false');
});
