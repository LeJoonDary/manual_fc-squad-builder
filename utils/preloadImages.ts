// Retain a bounded set of warm images across squad swaps; failed URLs can retry.
type Portrait = { image: HTMLImageElement; done: Promise<void>; settled: boolean };
const portraits = new Map<string, Portrait>();

function isDefaultPortrait(url?: string | null): boolean {
  if (!url?.trim()) return true;
  // Inspect the path only: a query string or hostname is not a placeholder marker.
  let path: string;
  try {
    path = new URL(url, 'https://preload.invalid/').pathname;
    path = decodeURIComponent(path);
  } catch {
    path = url.split(/[?#]/, 1)[0];
  }
  return /silhouette|placeholder|default/i.test(path);
}

function preloadPortrait(url: string): Portrait {
  const existing = portraits.get(url);
  if (existing) return existing;
  const img = new Image();
  let finish!: () => void;
  const portrait: Portrait = { image: img, done: new Promise(resolve => { finish = resolve; }), settled: false };
  const settle = () => { portrait.settled = true; finish(); };
  img.referrerPolicy = 'no-referrer';
  img.loading = 'eager';
  img.fetchPriority = 'high';
  img.decoding = 'async';
  img.onload = settle;
  img.onerror = () => {
    if (portraits.get(url) === portrait) portraits.delete(url);
    settle();
  };
  portraits.set(url, portrait);
  if (portraits.size > 100) portraits.delete(portraits.keys().next().value!);
  img.src = url;
  if (img.complete) {
    // Broken cached images are also complete; release the batch but allow a retry.
    if (!img.naturalWidth) portraits.delete(url);
    settle();
  }
  return portrait;
}

export function preloadImages(slots: Array<{ card?: { image_url?: string } } | null | undefined>) {
  for (const slot of slots) {
    const url = slot?.card?.image_url;
    if (url && !isDefaultPortrait(url)) preloadPortrait(url);
  }
}

// One 2500ms safety deadline for the whole page. Warm pages stay synchronous.
export function preloadCardImages(cards: Array<{ image_url?: string | null }>): Promise<void> | null {
  const pending = cards.map(card => card.image_url && !isDefaultPortrait(card.image_url)
    ? preloadPortrait(card.image_url) : null);
  if (pending.every(portrait => !portrait || portrait.settled)) return null;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<void>(resolve => { timer = setTimeout(resolve, 2500); });
  return Promise.race([
    Promise.allSettled(pending.map(portrait => portrait?.done ?? Promise.resolve())).then(() => {}),
    deadline,
  ]).finally(() => clearTimeout(timer));
}
