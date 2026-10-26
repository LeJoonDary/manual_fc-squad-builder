import { getPlaystyleName } from '../utils/playstyleNames.js';

let nextId = 0;

export function createPlaystyleIcons(styles, className = '', maxCount = Infinity) {
  const container = document.createElement('span');
  container.className = `${className} playstyle-icons`;
  const sorted = [...styles].sort((a, b) => Number(b?.isPlus) - Number(a?.isPlus));
  for (const style of sorted) {
    if (container.childElementCount >= maxCount) break;
    const url = style?.isPlus ? style.image_url_plus : style?.image_url;
    if (!url) continue;
    const label = `${getPlaystyleName(style)}${style.isPlus ? '+' : ''}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `playstyle-icon group relative inline-flex items-center justify-center cursor-default${style.isPlus ? ' is-plus' : ''}`;
    button.setAttribute('aria-label', label);
    const img = document.createElement('img');
    img.referrerPolicy = 'no-referrer';
    img.src = url;
    img.alt = label;
    img.width = 32;
    img.height = 32;
    img.loading = 'lazy';
    img.addEventListener('error', () => button.remove());
    const tooltip = document.createElement('span');
    tooltip.className = 'playstyle-icon-tooltip pointer-events-none absolute bottom-full mb-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-100 z-[9999] px-2 py-0.5 text-[11px] font-medium tracking-normal';
    tooltip.id = `playstyle-tooltip-${++nextId}`;
    tooltip.setAttribute('role', 'tooltip');
    tooltip.textContent = label;
    button.setAttribute('aria-describedby', tooltip.id);
    button.append(img, tooltip);
    const reveal = () => {
      button.classList.remove('tooltip-dismissed');
      button.classList.add('tooltip-open');
    };
    const hide = () => button.classList.remove('tooltip-open');
    button.addEventListener('pointerenter', reveal);
    button.addEventListener('pointerleave', hide);
    button.addEventListener('focus', reveal);
    button.addEventListener('blur', hide);
    button.addEventListener('click', event => {
      event.stopPropagation();
      reveal();
    });
    button.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        hide();
        button.classList.add('tooltip-dismissed');
        event.stopPropagation();
      }
      // Inspecting a trait must never select the enclosing player card.
      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
    });
    container.append(button);
  }
  return container;
}
