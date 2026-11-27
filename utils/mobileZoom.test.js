// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { resetMobileZoom, restoreMobileZoom } from './mobileZoom.js';
const original = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
function setup(width = 390) {
  vi.stubGlobal('innerWidth', width);
  document.head.innerHTML = `<meta name="viewport" content="${original}">`;
  document.body.innerHTML = '<div hidden></div><dialog></dialog>';
  return [document.querySelector('meta'), ...document.body.children];
}
afterEach(() => { restoreMobileZoom(); vi.unstubAllGlobals(); document.head.replaceChildren(); document.body.replaceChildren(); });
it('clamps on opening and restores exactly after the last overlapping modal closes', async () => {
  const [meta, picker, replacement] = setup();
  resetMobileZoom(picker); picker.hidden = false;
  expect(meta.content).toBe('width=device-width, initial-scale=1.0, maximum-scale=1.0');
  resetMobileZoom(replacement); replacement.open = true;
  picker.hidden = true; await Promise.resolve();
  expect(meta.content).toContain('maximum-scale=1.0');
  replacement.open = false; await Promise.resolve();
  expect(meta.content).toBe(original);
  resetMobileZoom(picker); picker.hidden = false;
  picker.remove(); await Promise.resolve();
  expect(meta.content).toBe(original);
});
it('restores on cleanup and page exit', () => {
  const [meta, picker] = setup();
  resetMobileZoom(picker); picker.hidden = false;
  restoreMobileZoom(); expect(meta.content).toBe(original);
  resetMobileZoom(picker);
  window.dispatchEvent(new Event('pagehide')); expect(meta.content).toBe(original);
});
it.each([768, 1440])('leaves desktop viewport unchanged at %ipx', width => {
  const [meta, picker] = setup(width);
  resetMobileZoom(picker); picker.hidden = false;
  expect(meta.content).toBe(original);
});
it('supports larger touch devices and missing viewport tags', () => {
  const [meta, picker] = setup(1024);
  vi.stubGlobal('navigator', { maxTouchPoints: 1 });
  resetMobileZoom(picker); picker.hidden = false;
  expect(meta.content).toContain('maximum-scale=1.0');
  restoreMobileZoom(); meta.remove();
  expect(() => resetMobileZoom(picker)).not.toThrow();
  vi.restoreAllMocks();
});
