let tooltip;
let active;
let nextId = 0;

function hideTooltip() {
  active?.removeAttribute('aria-describedby');
  active = null;
  if (tooltip) tooltip.hidden = true;
}

function showTooltip(button, label) {
  if (!tooltip) {
    tooltip = document.createElement('span');
    tooltip.className = 'playstyle-icon-tooltip';
    tooltip.id = `playstyle-tooltip-${++nextId}`;
    tooltip.setAttribute('role', 'tooltip');
    document.body.append(tooltip);
    document.addEventListener('pointerdown', event => {
      if (!active?.contains(event.target)) hideTooltip();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') hideTooltip();
    });
    document.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('resize', hideTooltip);
  }
  hideTooltip();
  active = button;
  tooltip.textContent = label;
  tooltip.hidden = false;
  button.setAttribute('aria-describedby', tooltip.id);
  const rect = button.getBoundingClientRect();
  const size = tooltip.getBoundingClientRect();
  tooltip.style.left = `${Math.max(8, Math.min(rect.left + rect.width / 2 - size.width / 2, window.innerWidth - size.width - 8))}px`;
  tooltip.style.top = `${rect.top >= size.height + 12 ? rect.top - size.height - 8 : rect.bottom + 8}px`;
}

export function createPlaystyleIcons(styles, className = '', maxCount = Infinity) {
  const container = document.createElement('span');
  container.className = `${className} playstyle-icons`;
  const sorted = [...styles].sort((a, b) => Number(b.isPlus) - Number(a.isPlus));
  for (const style of sorted) {
    if (container.childElementCount >= maxCount) break;
    const url = style.isPlus ? style.image_url_plus : style.image_url;
    if (!url) continue;
    const label = `${style.name}${style.isPlus ? '+' : ''}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `playstyle-icon${style.isPlus ? ' is-plus' : ''}`;
    button.setAttribute('aria-label', label);
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.width = 32;
    img.height = 32;
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      if (active === button) hideTooltip();
      button.remove();
    });
    button.append(img);
    button.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch') showTooltip(button, label);
    });
    button.addEventListener('pointerleave', event => {
      if (event.pointerType !== 'touch' && active === button) hideTooltip();
    });
    button.addEventListener('focus', () => showTooltip(button, label));
    button.addEventListener('blur', () => { if (active === button) hideTooltip(); });
    button.addEventListener('click', event => {
      event.stopPropagation();
      showTooltip(button, label);
    });
    // Inspecting a trait must never select the enclosing player card.
    button.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
    });
    container.append(button);
  }
  return container;
}
