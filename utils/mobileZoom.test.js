// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { resetMobileZoom } from './mobileZoom.js';

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.head.replaceChildren();
});

function setup(width) {
  vi.useFakeTimers();
  vi.stubGlobal('innerWidth', width);
  document.head.innerHTML = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
  return document.querySelector('meta');
}

it('restores unrestricted pinch zoom 300ms after the latest mobile opening', () => {
  const meta = setup(390);
  const original = meta.content;
  resetMobileZoom();
  expect(meta.content).toContain('maximum-scale=1.0');
  vi.advanceTimersByTime(200);
  resetMobileZoom();
  vi.advanceTimersByTime(100);
  expect(meta.content).toContain('user-scalable=no');
  vi.advanceTimersByTime(200);
  expect(meta.content).toBe(original);
});

it.each([768, 1440])('does not mutate the viewport or schedule work at %ipx', width => {
  const meta = setup(width);
  const original = meta.content;
  resetMobileZoom();
  expect(meta.content).toBe(original);
  expect(vi.getTimerCount()).toBe(0);
});

it('tolerates a missing viewport tag', () => {
  setup(390).remove();
  expect(resetMobileZoom).not.toThrow();
  expect(vi.getTimerCount()).toBe(0);
});
