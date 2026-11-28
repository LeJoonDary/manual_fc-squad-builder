// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createRecommendationControls } from './RecommendationControls.js';

test.each(['empty', 'replace'])('%s synchronizes numeric prices and remembers explicit remaining budget', mode => {
  vi.useFakeTimers();
  let controls;
  const options = { mode, maxPrice: 30000, totalBudget: 100000, onSort: vi.fn() };
  const render = priceSelection => {
    controls?.dispose();
    controls = createRecommendationControls({ ...options, priceSelection, onPrice: (_value, selection) => render(selection) });
  };
  const buttons = () => [...controls.element.querySelectorAll('.recommendation-prices button')];
  const active = () => buttons().filter(button => button.getAttribute('aria-pressed') === 'true');
  try {
    render();
    expect(active().map(button => button.textContent)).toEqual(['30K']);
    buttons().at(-1).click();
    expect(active()).toEqual([buttons().at(-1)]);
    const enter = value => {
      const input = controls.element.querySelector('input');
      input.value = value; input.dispatchEvent(new Event('input'));
      vi.advanceTimersByTime(1000);
      expect(input.value).toBe(value ? Number(value).toLocaleString('en-US') : '');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    };
    enter('50000');
    expect(active().map(button => button.textContent)).toEqual(['50K']);
    vi.advanceTimersByTime(300);
    expect(active().map(button => button.textContent)).toEqual(['50K']);
    enter('12345'); expect(active()).toEqual([]);
    vi.advanceTimersByTime(300); expect(active()).toEqual([]);
    enter(''); expect(active()).toEqual([]);
    vi.advanceTimersByTime(300); expect(active()).toEqual([]);
  } finally { controls.dispose(); vi.useRealTimers(); }
});

 test('slow typing never queries and Enter followed by blur commits once', () => {
  vi.useFakeTimers();
  const onPrice = vi.fn();
  const controls = createRecommendationControls({ maxPrice: 30000, onSort: vi.fn(), onPrice });
  const input = controls.element.querySelector('input');
  for (const value of ['5', '50', '', '50000']) {
    input.value = value; input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(2000);
    expect(input.value).toBe(value ? Number(value).toLocaleString('en-US') : ''); expect(onPrice).not.toHaveBeenCalled();
  }
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  input.dispatchEvent(new FocusEvent('blur'));
  expect(onPrice).toHaveBeenCalledExactlyOnceWith(50000, { value: 50000 }, true);
  expect(input.value).toBe('50,000');
  expect(input.enterKeyHint).toBe('done');
  controls.dispose(); vi.useRealTimers();
});

test('formatting preserves digit-relative caret position without committing', () => {
  const onPrice = vi.fn();
  const controls = createRecommendationControls({ onSort: vi.fn(), onPrice });
  const input = controls.element.querySelector('input');
  input.value = '1234500'; input.setSelectionRange(3, 3);
  input.dispatchEvent(new Event('input'));
  expect(input.value).toBe('1,234,500'); expect(input.selectionStart).toBe(4);
  input.value = '1,24,500'; input.setSelectionRange(3, 3);
  input.dispatchEvent(new Event('input'));
  expect(input.value).toBe('124,500'); expect(input.selectionStart).toBe(2);
  expect(onPrice).not.toHaveBeenCalled(); controls.dispose();
});
