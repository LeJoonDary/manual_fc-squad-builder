// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { preloadImages } from './preloadImages';

test('starts all eleven portraits immediately, deduplicates, and retries failures', () => {
  const images: HTMLImageElement[] = [];
  vi.stubGlobal('Image', function () {
    const img = document.createElement('img');
    images.push(img);
    return img;
  });
  try {
    const slots = Array.from({ length: 11 }, (_, i) => ({ card: { image_url: `/squad-${i}.png` } }));
    preloadImages([...slots, null, {}, slots[0]]);
    expect(images).toHaveLength(11);
    expect(images.map(img => img.getAttribute('src'))).toEqual(slots.map(slot => slot.card.image_url));
    expect(images.every(img => img.fetchPriority === 'high' && img.loading === 'eager'
      && img.decoding === 'async' && img.referrerPolicy === 'no-referrer')).toBe(true);
    preloadImages(slots);
    expect(images).toHaveLength(11);
    images[0].dispatchEvent(new Event('error'));
    preloadImages(slots);
    expect(images).toHaveLength(12);
  } finally {
    vi.unstubAllGlobals();
  }
});
