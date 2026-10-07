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
      button.addEventListener('click', () => onChange(gold
        ? currentReqList.filter(req => String(req.id) !== String(item.id))
        : selected ? currentReqList.map(req => req === currentReq ? { ...req, isPlus: true } : req)
          : [...currentReqList, { id: Number(item.id), name: item.name, isPlus: false }]));
      const tooltip = document.createElement('div');
      tooltip.className = 'tactical-playstyle-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      tooltip.id = `playstyle-tooltip-${selectedSlot}-${item.id}`;
      tooltip.textContent = item.name;
      if (selected) {
        const tier = document.createElement('span');
        tier.textContent = gold ? ' (Gold+)' : ' (Silver)';
        tooltip.append(tier);
      }
      button.setAttribute('aria-describedby', tooltip.id);
      wrapper.append(button, tooltip);
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
