// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { toCanvas } from 'html-to-image';
import { createSquadPng } from './squadImage.js';
vi.mock('html-to-image', () => ({ toCanvas: vi.fn() }));
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
function pitch() {
  document.body.innerHTML = '<div><section class="pitch"><div class="pitch-watermarks"><span class="pitch-watermark">metaxi.net</span></div><button class="manager-slot">Add Manager</button><div class="slot occupied pitch-compatible is-drop-target"><div class="slot-card-actions">Edit</div></div></section></div>';
  const source = document.querySelector('.pitch');
  Object.defineProperties(source, { offsetWidth: { value: 900 }, offsetHeight: { value: 1040 } });
  source.getClientRects = () => [{}];
  return source;
}
test('captures the actual pitch with summary and restores live DOM', async () => {
  const source = pitch(), original = source.outerHTML;
  toCanvas.mockImplementationOnce(async (node, options) => {
    expect(options.pixelRatio).toBe(2);
    expect(node.textContent).toContain('Team Chemistry 30/33');
    expect(node.textContent).toContain('metaxi.net');
    expect(node.querySelector('.pitch')).toBe(source);
    expect(options.skipFonts).toBe(true);
    return { width: 10, height: 10, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(Array.from({ length: 400 }, (_, i) => i % 4 === 3 ? 255 : i % 251)) }) }), toBlob: resolve => resolve(new Blob(['png'], { type: 'image/png' })) };
  });
  expect(await createSquadPng(source, { chemistry: 30 })).toBeInstanceOf(Blob);
  expect(source.outerHTML).toBe(original);
  expect(document.querySelector('.squad-png-export')).toBeNull();
});
test('capture failures always remove the temporary export wrapper', async () => {
  toCanvas.mockRejectedValueOnce(new Error('capture failed'));
  await expect(createSquadPng(pitch())).rejects.toThrow('capture failed');
  expect(document.querySelector('.squad-png-export')).toBeNull();
});

test('rejects uniform navy raster instead of returning a blank PNG', async () => {
  toCanvas.mockResolvedValueOnce({ width: 10, height: 10, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(400).fill(255) }) }) });
  await expect(createSquadPng(pitch())).rejects.toThrow('blank or nearly uniform');
  expect(document.querySelector('.squad-png-export')).toBeNull();
});
