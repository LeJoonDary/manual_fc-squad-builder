import { STAT_GROUPS } from './statFilters.js';

export function detailStatGroups(card) {
  const isKeeper = String(card.primary_position ?? card.position ?? '').trim().toUpperCase() === 'GK';
  const stats = Array.isArray(card.raw?.player_stats) ? card.raw.player_stats[0] : card.raw?.player_stats;
  return Object.entries(STAT_GROUPS).filter(([group]) => isKeeper ? group === 'GOALKEEPING' : group !== 'GOALKEEPING')
    .map(([group, keys]) => ({ group, stats: keys.map(key => ({ key, value: stats?.[key] ?? null })) }));
}

export function renderDetailStatGroups(mount, card) {
  mount.replaceChildren();
  const groups = detailStatGroups(card);
  const columns = Array.from({ length: Math.min(2, groups.length) }, () => {
    const column = document.createElement('div'); column.className = 'detail-stat-column';
    mount.append(column); return column;
  });
  let index = 0;
  for (const group of groups) {
    const section = document.createElement('section'); section.className = 'detail-stat-category';
    const title = document.createElement('h3'); title.textContent = group.group;
    section.append(title);
    for (const { key, value } of group.stats) {
      const row = document.createElement('div'); row.className = 'detail-substat'; row.dataset.stat = key;
      const label = document.createElement('span');
      label.textContent = key.length === 3 ? key.toUpperCase() : key.replace(/^gk_/, '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
      const number = document.createElement('strong'); number.textContent = value == null ? '—' : String(value);
      row.append(label, number);
      if (value != null && Number.isFinite(Number(value))) {
        const bar = document.createElement('div'); bar.className = 'detail-stat-bar'; bar.setAttribute('aria-hidden', 'true');
        const fill = document.createElement('i'); fill.style.width = `${Math.max(0, Math.min(99, Number(value))) / 99 * 100}%`;
        fill.style.backgroundColor = value >= 80 ? '#63e6be' : value >= 60 ? '#ffd43b' : '#ff9696';
        bar.append(fill); row.append(bar);
      }
      section.append(row);
    }
    columns[index++ % columns.length].append(section);
  }
}
