// DOM-modal lifecycle equivalent of an effect: retain the original viewport
// across overlapping modals, and restore it after the last one closes/removes.
let viewport, originalContent, observer, restoreTimer;
const modals = new Set();
export function restoreMobileZoom() {
  observer?.disconnect(); observer = undefined;
  if (viewport) {
    const meta = viewport;
    const content = (originalContent ?? 'width=device-width, initial-scale=1').split(',')
      .map(value => value.trim()).filter(value => !/^(maximum-scale|user-scalable)\s*=/i.test(value)).concat('user-scalable=yes').join(', ');
    meta.setAttribute('content', content);
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => { if (!viewport && meta.isConnected) meta.setAttribute('content', content); }, 100);
  }
  viewport = undefined;
  modals.clear();
  window.removeEventListener('pagehide', restoreMobileZoom);
}
export function releaseMobileZoom(modal) {
  modals.delete(modal);
  if (![...modals].some(node => node.isConnected && (node.tagName === 'DIALOG' ? node.open : !node.hidden))) restoreMobileZoom();
}
export function resetMobileZoom(modal) {
  if (!modal || !(window.innerWidth < 768 || navigator.maxTouchPoints > 0)) return;
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  clearTimeout(restoreTimer);
  if (!viewport) {
    viewport = meta;
    originalContent = meta.getAttribute('content');
    observer = new MutationObserver(() => {
      const anyOpen = [...modals].some(node => node.isConnected &&
        (node.tagName === 'DIALOG' ? node.open : !node.hidden));
      if (!anyOpen) restoreMobileZoom();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'open'] });
    window.addEventListener('pagehide', restoreMobileZoom);
  }
  modals.add(modal);
  meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0');
}
