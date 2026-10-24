// Retain a bounded set of warm images across squad swaps; failed URLs can retry.
const portraits = new Map<string, HTMLImageElement>();
export function preloadImages(slots: Array<{ card?: { image_url?: string } } | null | undefined>) {
  for (const slot of slots) {
    const url = slot?.card?.image_url;
    if (!url || portraits.has(url)) continue;
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.loading = 'eager';
    img.fetchPriority = 'high';
    img.decoding = 'async';
    img.onerror = () => { if (portraits.get(url) === img) portraits.delete(url); };
    portraits.set(url, img);
    if (portraits.size > 64) portraits.delete(portraits.keys().next().value!);
    img.src = url;
  }
}
