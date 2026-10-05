import { STAT_GROUPS } from './statFilters.js';

const statColor = value => value == null ? '#64748b' : value >= 80 ? '#4ade80' : value >= 70 ? '#fb923c' : '#ff6b6b';
const mainStats = { PACE: ['pac', 'pace'], SHOOTING: ['sho', 'shooting'], PASSING: ['pas', 'passing'],
  DRIBBLING: ['dri', 'dribbling'], DEFENDING: ['def', 'defending'], PHYSICAL: ['phy', 'physicality'] };

function createGauge(value, label) {
  const gauge = document.createElement('span');
  gauge.className = 'detail-stat-gauge';
  gauge.setAttribute('aria-label', `${label}: ${value ?? 'unavailable'}`);
  gauge.style.color = statColor(value);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 36');
  svg.setAttribute('aria-hidden', 'true');
  for (const active of [false, true]) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', 'M 5 32 A 27 27 0 0 1 59 32');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', active ? 'currentColor' : '#29384d');
    path.setAttribute('stroke-width', '6');
    path.setAttribute('pathLength', '100');
    if (active) path.setAttribute('stroke-dasharray', `${Math.max(0, Math.min(99, Number(value) || 0)) / 99 * 100} 100`);
    svg.append(path);
  }
  const number = document.createElement('strong');
  number.textContent = value ?? '—';
  gauge.append(svg, number);
  return gauge;
}

export function detailStatGroups(card) {
  const isKeeper = String(card.primary_position ?? card.position ?? '').trim().toUpperCase() === 'GK';
  const stats = Array.isArray(card.raw?.player_stats) ? card.raw.player_stats[0] : card.raw?.player_stats;
  return Object.entries(STAT_GROUPS).filter(([group]) => isKeeper ? group === 'GOALKEEPING' : group !== 'GOALKEEPING')
    .map(([group, keys]) => ({ group, stats: keys.map(key => ({
      key,
      value: key === 'dribbling_sub' ? stats?.dribbling ?? stats?.dribbling_sub ?? 0 : stats?.[key] ?? null,
    })) }));
}

export function renderDetailStatGroups(mount, card) {
  mount.replaceChildren();
  const groups = detailStatGroups(card);
  for (const group of groups) {
    const section = document.createElement('section'); section.className = 'detail-stat-category';
    const title = document.createElement('h3'); title.textContent = group.group;
    const header = document.createElement('div'); header.className = 'detail-stat-heading';
    header.append(title);
    const main = mainStats[group.group];
    if (main) {
      const value = card[main[0]] ?? card[main[1]] ?? group.stats.find(stat => stat.key === main[0])?.value;
      header.append(createGauge(value, group.group));
    }
    section.append(header);
    for (const { key, value } of group.stats) {
      if (key === main?.[0]) continue;
      const row = document.createElement('div'); row.className = 'detail-substat'; row.dataset.stat = key;
      const label = document.createElement('span');
      label.textContent = key === 'dribbling_sub' ? 'Dribbling' : key.length === 3 ? key.toUpperCase() : key.replace(/^gk_/, '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
      const number = document.createElement('strong'); number.textContent = value == null ? '—' : String(value);
      row.append(label, number);
      if (value != null && Number.isFinite(Number(value))) {
        const bar = document.createElement('div'); bar.className = 'detail-stat-bar'; bar.setAttribute('aria-hidden', 'true');
        const fill = document.createElement('i'); fill.style.width = `${Math.max(0, Math.min(99, Number(value))) / 99 * 100}%`;
        fill.style.backgroundColor = statColor(value);
        number.style.color = statColor(value);
        bar.append(fill); row.append(bar);
      }
      section.append(row);
    }
    if (group.group === 'PACE') {
      const row = document.createElement('div'); row.className = 'detail-substat';
      const label = document.createElement('span'); label.textContent = 'AcceleRATE';
      const value = document.createElement('strong'); value.textContent = card.accele_type || '—';
      row.append(label, value); section.append(row);
    }
    mount.append(section);
  }
}
