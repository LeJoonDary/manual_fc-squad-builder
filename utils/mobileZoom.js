let pendingReset;

// Temporarily clamp pinch zoom before opening a mobile modal, then restore
// the page's original zoom policy. Repeated opens share one restoration timer.
export function resetMobileZoom() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.innerWidth >= 768) return;

  const viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport) return;

  if (pendingReset) {
    clearTimeout(pendingReset.timer);
    pendingReset.restore();
  }
  const original = viewport.getAttribute('content');
  const restore = () => {
    if (original === null) viewport.removeAttribute('content');
    else viewport.setAttribute('content', original);
  };
  viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
  pendingReset = {
    restore,
    timer: setTimeout(() => {
      restore();
      pendingReset = undefined;
    }, 300),
  };
}
