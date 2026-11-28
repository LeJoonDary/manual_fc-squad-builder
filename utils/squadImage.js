import { toCanvas } from 'html-to-image';

// Capture the rendered pitch, including the effective custom card fields and badges.
export async function createSquadPng(pitch, summary = {}) {
  if (!pitch) throw new Error('Pitch is unavailable');
  const pitchWidth = pitch.offsetWidth, pitchHeight = pitch.offsetHeight;
  if (!pitchWidth || !pitchHeight || !pitch.getClientRects().length) throw new Error('Pitch has no visible layout');
  const wrapper = document.createElement('div');
  wrapper.className = 'squad-png-export';
  const width = pitchWidth;
  wrapper.style.width = `${width}px`;
  const clone = pitch; // Capture the live rendered DOM, never an offscreen duplicate.
  const originalStyle = pitch.getAttribute('style');
  const anchor = document.createComment('pitch export location');
  const restore = [];
  pitch.before(anchor);
  clone.style.setProperty('width', `${width}px`, 'important');
  clone.style.setProperty('height', `${pitchHeight}px`, 'important');
  const header = document.createElement('div'); header.className = 'squad-png-header';
  const brand = document.createElement('strong'); brand.textContent = 'MetaXI · metaxi.net';
  const symbol = clone.querySelector('.pitch-watermark svg')?.cloneNode(true);
  if (symbol) brand.prepend(symbol);
  const stats = document.createElement('span');
  stats.textContent = `Formation ${summary.formation ?? ''} · Team Chemistry ${summary.chemistry ?? 0}/33 · Total Cost ${Number(summary.cost ?? 0).toLocaleString('en-US')} C · Avg OVR ${Number(summary.averageOvr ?? 0).toFixed(1)}`;
  header.append(brand, stats); wrapper.append(header);
  anchor.after(wrapper); wrapper.append(pitch);
  try {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await document.fonts?.ready;
    // Inline each asset independently; blocked assets get a visible placeholder.
    const placeholder = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#24364b"/><path d="M10 50l16-18 10 10 8-8 10 16" fill="none" stroke="#94a3b8" stroke-width="3"/></svg>');
    const assets = new Map();
    const embed = url => {
      if (url.startsWith('data:')) return Promise.resolve(url);
      if (!assets.has(url)) assets.set(url, (async () => {
        const response = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'reload', signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('Image unavailable');
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
        });
      })().catch(error => { console.warn('[Squad PNG] Asset fallback:', url, error); return placeholder; }));
      return assets.get(url);
    };
    await Promise.all([...clone.querySelectorAll('img')].map(async img => {
      const source = img.currentSrc || img.src;
      if (!source) return;
      const attrs = ['src', 'srcset', 'crossorigin', 'loading'].map(key => [key, img.getAttribute(key)]);
      restore.push(() => attrs.forEach(([key, value]) => value == null ? img.removeAttribute(key) : img.setAttribute(key, value)));
      img.crossOrigin = 'anonymous'; img.removeAttribute('srcset'); img.loading = 'eager';
      img.src = await embed(source);
      if (img.classList.contains('pitch-background')) {
        if (img.src === placeholder) throw new Error('Pitch background could not be loaded');
        await img.decode();
        if (!img.complete || img.naturalWidth <= 0) throw new Error('Pitch background has no decoded pixels');
        return;
      }
      try { await img.decode(); } catch (error) { console.warn('[Squad PNG] Decode fallback:', source, error); img.src = placeholder; await img.decode(); }
    }));
    await Promise.all([clone, ...clone.querySelectorAll('*')].map(async node => {
      let background = getComputedStyle(node).backgroundImage;
      const urls = [...background.matchAll(/url\(["']?(.*?)["']?\)/g)];
      for (const match of urls) background = background.replace(match[0], `url("${await embed(match[1])}")`);
      if (urls.length) {
        const original = node.getAttribute('style');
        restore.push(() => original == null ? node.removeAttribute('style') : node.setAttribute('style', original));
        node.style.backgroundImage = background;
      }
    }));
    const canvas = await toCanvas(wrapper, {
      width: wrapper.offsetWidth, height: wrapper.offsetHeight,
      pixelRatio: 2, skipFonts: true, cacheBust: true, includeQueryParams: true,
      backgroundColor: '#0b1324', imagePlaceholder: placeholder,
      fetchRequestInit: { mode: 'cors', credentials: 'omit' },
      style: { transform: 'none', margin: '0', opacity: '1' },
    });
    // A successful encoder can still return a blank foreignObject raster.
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context || !canvas.width || !canvas.height) throw new Error('PNG canvas is empty');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    for (let i = 0; i < pixels.length; i += 4 * Math.max(1, Math.floor(canvas.width / 80))) {
      if (pixels[i + 3]) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      if (colors.size > 8) break;
    }
    if (colors.size <= 8) throw new Error('PNG raster is blank or nearly uniform (foreignObject rendering failed)');
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Unable to encode squad PNG');
    return blob;
  } finally {
    restore.reverse().forEach(reset => reset());
    anchor.replaceWith(pitch);
    if (originalStyle == null) pitch.removeAttribute('style'); else pitch.setAttribute('style', originalStyle);
    wrapper.remove();
  }
}
export async function downloadSquadPng(pitch, formation, summary = {}) {
  const blob = await createSquadPng(pitch, { ...summary, formation });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `metaxi-${formation}-squad.png`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
