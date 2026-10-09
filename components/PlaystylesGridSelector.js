// One active tooltip across all tactical grids; no per-icon CSS hover state.
let activeTooltip = null;
function clearActiveTooltip() {
  if (!activeTooltip) return;
  const { button, node, observer, controller } = activeTooltip;
  activeTooltip = null;
  observer.disconnect(); controller.abort();
  button.removeAttribute('aria-describedby'); node.remove();
}
function showActiveTooltip(button, label, grid) {
  clearActiveTooltip();
  const node = document.createElement('div');
  node.className = 'tactical-active-tooltip'; node.id = 'tactical-active-tooltip';
  node.setAttribute('role', 'tooltip'); node.textContent = label;
  const rect = button.getBoundingClientRect();
  node.style.left = `${rect.left + rect.width / 2}px`; node.style.top = `${rect.top - 8}px`;
  node.style.pointerEvents = 'none'; node.style.userSelect = 'none';
  grid.append(node); button.setAttribute('aria-describedby', node.id);
  const controller = new AbortController();
  const observer = new MutationObserver(() => {
    if (!button.isConnected || button.closest('[hidden], [aria-hidden="true"], .hidden')) clearActiveTooltip();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden','aria-hidden','class'] });
  activeTooltip = { button, node, observer, controller };
  document.addEventListener('scroll', clearActiveTooltip, { capture: true, signal: controller.signal });
  window.addEventListener('resize', clearActiveTooltip, { signal: controller.signal });
  window.addEventListener('blur', clearActiveTooltip, { signal: controller.signal });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') clearActiveTooltip(); }, { signal: controller.signal });
}

export const CATEGORY_DISPLAY_ORDER = ['Shooting', 'Passing', 'Defending', 'Ball Control', 'Physical', 'Goalkeeper'];
const EXCLUDED_PLAYSTYLE_NAMES = ['Power Header', 'Trivela', 'Flair', 'Aerial'];
const EXCLUDED_PLAYSTYLE_IDS = [11, 13, 18, 22];

function appendPlaystyleImage(face, item, gold) {
  const base = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const storage = level => base ? `${base}/storage/v1/object/public/playstyle-icons/${level}_${encodeURIComponent(item.id)}.png` : '';
  const urls = [...new Set((gold
    ? [item.image_url_plus, item.image_url, storage('plus'), storage('normal')]
    : [item.image_url, item.image_url_plus, storage('normal'), storage('plus')])
    .map(url => typeof url === 'string' ? url.trim() : '').filter(Boolean))];
  const img = document.createElement('img');
  img.alt = '';
  let index = 0;
  const next = () => {
    if (index < urls.length) img.src = urls[index++];
    else {
      // Keep a visual placeholder, never initials or broken-image alt text.
      img.remove();
      face.classList.add('is-unavailable');
      face.setAttribute('aria-label', '이미지를 불러올 수 없습니다');
    }
  };
  img.addEventListener('error', next);
  face.append(img);
  next();
}

export function createPlaystylesGridSelector({ selectedSlot, playstylesList, currentReqList = [], onChange }) {
  clearActiveTooltip();
  const activePlaystyles = playstylesList.filter(item =>
    !EXCLUDED_PLAYSTYLE_IDS.includes(Number(item.id))
    && !EXCLUDED_PLAYSTYLE_NAMES.some(name => name.toLowerCase() === item.name?.trim().toLowerCase()));
  const grid = document.createElement('div');
  grid.className = 'tactical-playstyles-grid';
  const header = document.createElement('div');
  header.className = 'tactical-playstyles-heading';
  header.textContent = `◇ PLAYSTYLES (${selectedSlot})${currentReqList.length ? ` [${currentReqList.length} selected]` : ""}`;
  const selection = document.createElement('span');
  selection.textContent = 'Click: None → Silver → Gold+ → None';
  header.append(selection);
  grid.append(header);
  for (const category of CATEGORY_DISPLAY_ORDER) {
    const items = activePlaystyles.filter(item => item.category?.trim().toLowerCase() === category.toLowerCase());
    if (!items.length) continue;
    const row = document.createElement('section');
    row.className = 'tactical-playstyles-category';
    const label = document.createElement('h3');
    label.textContent = category === 'Shooting' ? 'FINISHING' : category.toUpperCase();
    const icons = document.createElement('div');
    icons.className = 'tactical-playstyles-icons';
    for (const item of items) {
      const currentReq = currentReqList.find(req => String(req.id) === String(item.id));
      const selected = !!currentReq;
      const gold = selected && currentReq.isPlus;
      const wrapper = document.createElement('div');
      wrapper.className = 'tactical-playstyle-item' + (gold ? ' is-gold' : '');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `tactical-playstyle-diamond${selected ? gold ? ' is-gold' : ' is-silver' : ''}`;
      button.dataset.playstyleId = item.id;
      button.setAttribute('aria-label', `${item.name} (${selected ? gold ? 'Gold+' : 'Silver' : 'None'})`);
      button.setAttribute('aria-pressed', String(selected));
      const face = document.createElement('span');
      face.className = 'tactical-playstyle-face';
      appendPlaystyleImage(face, item, gold);
      button.append(face);
      button.addEventListener('click', () => { clearActiveTooltip(); onChange(gold
        ? currentReqList.filter(req => String(req.id) !== String(item.id))
        : selected ? currentReqList.map(req => req === currentReq ? { ...req, isPlus: true } : req)
          : [...currentReqList, { id: Number(item.id), name: item.name, isPlus: false }]); });
      const labelText = `${item.name}${selected ? gold ? ' (Gold+)' : ' (Silver)' : ''}`;
      button.addEventListener('mouseenter', () => showActiveTooltip(button, labelText, grid));
      button.addEventListener('mouseleave', clearActiveTooltip);
      button.addEventListener('focus', () => showActiveTooltip(button, labelText, grid));
      button.addEventListener('blur', clearActiveTooltip);
      wrapper.append(button);
      icons.append(wrapper);
    }
    row.append(label, icons);
    grid.append(row);
  }
  if (!grid.querySelector('.tactical-playstyles-category')) {
    const empty = document.createElement('p');
    empty.textContent = 'No Playstyles available.';
    grid.append(empty);
  }
  return grid;
}
