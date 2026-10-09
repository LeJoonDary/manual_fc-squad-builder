// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createPlaystylesGridSelector } from './PlaystylesGridSelector.js';
afterEach(() => vi.unstubAllEnvs());
const item = { id: 7, name: 'Technical', category: 'Ball Control', image_url: ' /silver.png ', image_url_plus: ' /gold.png ' };
function render(style = item, currentReq) {
  return createPlaystylesGridSelector({ selectedSlot: 'ST', playstylesList: [style], currentReqList: currentReq ? [currentReq] : [], onChange: vi.fn() });
}
it('trims URLs, retries opposite tier and storage, then stops without initials', () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co/');
  const grid = render();
  const img = grid.querySelector('img');
  expect(img.getAttribute('src')).toBe('/silver.png');
  for (const url of ['/gold.png', 'https://example.supabase.co/storage/v1/object/public/playstyle-icons/normal_7.png', 'https://example.supabase.co/storage/v1/object/public/playstyle-icons/plus_7.png']) {
    img.dispatchEvent(new Event('error'));
    expect(img.getAttribute('src')).toBe(url);
  }
  img.dispatchEvent(new Event('error'));
  expect(grid.querySelector('img')).toBeNull();
  expect(grid.querySelector('.tactical-playstyle-face').textContent).toBe('');
  expect(grid.querySelector('.is-unavailable')).not.toBeNull();
});
it('uses plus for blank normal URLs and normal when the gold image fails', () => {
  expect(render({ ...item, image_url: ' ' }).querySelector('img').getAttribute('src')).toBe('/gold.png');
  const img = render(item, { id: 7, name: 'Technical', isPlus: true }).querySelector('img');
  expect(img.getAttribute('src')).toBe('/gold.png');
  img.dispatchEvent(new Event('error'));
  expect(img.getAttribute('src')).toBe('/silver.png');
});

it('keeps other selections while cycling one style through silver, gold and none', () => {
  const second = { ...item, id: 9, name: 'Intercept', category: 'Defending' };
  let selected = [];
  let grid;
  const update = value => {
    selected = value;
    grid = createPlaystylesGridSelector({ selectedSlot: 'ST', playstylesList: [item, second], currentReqList: selected, onChange: update });
  };
  update([]);
  const click = id => grid.querySelector(`[data-playstyle-id="${id}"]`).click();
  click(7); click(9); click(7);
  expect(selected).toEqual([{ id: 7, name: 'Technical', isPlus: true }, { id: 9, name: 'Intercept', isPlus: false }]);
  expect(grid.textContent).toContain('[2 selected]');
  click(7);
  expect(selected).toEqual([{ id: 9, name: 'Intercept', isPlus: false }]);
});

it('keeps only one non-interactive tooltip and clears on click, leave and removal', async () => {
 const second = { ...item, id: 9, name: 'Intercept', category: 'Defending' };
 const grid = createPlaystylesGridSelector({ selectedSlot: 'ST', playstylesList: [item,second], onChange: vi.fn() });
 document.body.append(grid);
 const buttons = grid.querySelectorAll('button');
 buttons[0].dispatchEvent(new MouseEvent('mouseenter'));
 expect(grid.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
 expect(grid.querySelector('[role="tooltip"]').style.pointerEvents).toBe('none');
 buttons[1].dispatchEvent(new MouseEvent('mouseenter'));
 expect(grid.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
 expect(buttons[0].hasAttribute('aria-describedby')).toBe(false);
 buttons[1].click();
 expect(grid.querySelector('[role="tooltip"]')).toBeNull();
 buttons[0].dispatchEvent(new FocusEvent('focus'));
 buttons[0].dispatchEvent(new MouseEvent('mouseleave'));
 expect(grid.querySelector('[role="tooltip"]')).toBeNull();
 buttons[0].dispatchEvent(new MouseEvent('mouseenter'));
 document.dispatchEvent(new Event('scroll'));
 expect(grid.querySelector('[role="tooltip"]')).toBeNull();
 buttons[0].dispatchEvent(new MouseEvent('mouseenter'));
 grid.remove();
 await Promise.resolve();
 expect(grid.querySelector('[role="tooltip"]')).toBeNull();
});
it('clears active tooltip when the modal is hidden or grid rerendered', async () => {
 const modal = document.createElement('div'); const grid = render(); modal.append(grid); document.body.append(modal);
 grid.querySelector('button').dispatchEvent(new MouseEvent('mouseenter'));
 modal.hidden = true; await Promise.resolve();
 expect(grid.querySelector('[role="tooltip"]')).toBeNull();
 modal.hidden = false;
 grid.querySelector('button').dispatchEvent(new MouseEvent('mouseenter'));
 render();
 expect(grid.querySelector('[role="tooltip"]')).toBeNull();
 modal.remove();
});
