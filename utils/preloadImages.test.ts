// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { preloadImages, preloadCardImages } from './preloadImages';

test('default portraits skip downloads while real URLs in a mixed batch still wait', async () => {
  const images: HTMLImageElement[] = [];
  vi.stubGlobal('Image', function () {
    const image = document.createElement('img');
    images.push(image);
    return image;
  });
  try {
    const defaults = [null, '', '  ', '/Silhouette.png', '/placeholder/avatar.png',
      'https://cdn.example.com/default-avatar.png', '/%64efault.png'].map(image_url => ({ image_url }));
    expect(preloadCardImages(defaults)).toBeNull();
    expect(images).toHaveLength(0);
    const wait = preloadCardImages([...defaults, { image_url: 'https://default.example.com/real-face.png?label=placeholder' }]);
    expect(wait).toBeInstanceOf(Promise);
    expect(images).toHaveLength(1);
    images[0].dispatchEvent(new Event('load'));
    await wait;
  } finally {
    vi.unstubAllGlobals();
  }
});

test.each([0, 100])('complete browser images resolve without a load event (naturalWidth=%s)', naturalWidth => {
  vi.stubGlobal('Image', function () {
    const image = document.createElement('img');
    Object.defineProperty(image, 'complete', { value: true });
    Object.defineProperty(image, 'naturalWidth', { value: naturalWidth });
    return image;
  });
  vi.useFakeTimers();
  try {
    expect(preloadCardImages([{ image_url: `/browser-cached-${naturalWidth}.png` }])).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

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

test('waits for all 15 portraits, including errors, and skips missing URLs', async () => {
  const images: HTMLImageElement[] = [];
  vi.stubGlobal('Image', function () {
    const image = document.createElement('img');
    images.push(image);
    return image;
  });
  vi.useFakeTimers();
  try {
    expect(preloadCardImages([{}, { image_url: null }])).toBeNull();
    const cards = Array.from({ length: 15 }, (_, i) => ({ image_url: `/batch-${i}.png` }));
    const done = vi.fn();
    const wait = preloadCardImages([...cards, {}])!.then(done);
    expect(images).toHaveLength(15);
    images.slice(0, 14).forEach(image => image.dispatchEvent(new Event('load')));
    await vi.advanceTimersByTimeAsync(1200);
    expect(done).not.toHaveBeenCalled();
    images[14].dispatchEvent(new Event('error'));
    await wait;
    expect(done).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(preloadCardImages(cards.slice(0, 14))).toBeNull();
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

test('a stalled batch renders after a single 2500ms deadline and can finish warming later', async () => {
  const images: HTMLImageElement[] = [];
  vi.stubGlobal('Image', function () {
    const image = document.createElement('img');
    images.push(image);
    return image;
  });
  vi.useFakeTimers();
  try {
    const cards = [{ image_url: '/slow-a.png' }, { image_url: '/slow-b.png' }];
    const done = vi.fn();
    const wait = preloadCardImages(cards)!.then(done);
    await vi.advanceTimersByTimeAsync(2499);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await wait;
    expect(done).toHaveBeenCalledOnce();
    images.forEach(image => image.dispatchEvent(new Event('load')));
    expect(preloadCardImages(cards)).toBeNull();
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
