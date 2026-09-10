export const STAT_GROUPS = {
  PACE: ['pac', 'acceleration', 'sprint_speed'],
  SHOOTING: ['sho', 'positioning', 'finishing', 'shot_power', 'long_shots', 'volleys', 'penalties'],
  PASSING: ['pas', 'vision', 'crossing', 'fk_accuracy', 'short_passing', 'long_passing', 'curve'],
  DRIBBLING: ['dri', 'agility', 'balance', 'reactions', 'ball_control', 'dribbling_sub', 'composure'],
  DEFENDING: ['def', 'interceptions', 'heading_accuracy', 'def_awareness', 'standing_tackle', 'sliding_tackle'],
  PHYSICAL: ['phy', 'jumping', 'stamina', 'strength', 'aggression'],
  GOALKEEPING: ['gk_diving', 'gk_handling', 'gk_kicking', 'gk_positioning', 'gk_reflexes'],
};
export const STAT_KEYS = Object.values(STAT_GROUPS).flat();
export const defaultStats = () => Object.fromEntries(STAT_KEYS.map(key => [key, { min: '', max: '' }]));
const hasValue = value => value !== '' && value != null;
export const activeStats = stats => STAT_KEYS.filter(key => hasValue(stats[key].min) || hasValue(stats[key].max));
export function applyStatQuery(query, stats) {
  for (const key of activeStats(stats)) {
    if (hasValue(stats[key].min)) query = query.gte(`player_stats.${key}`, stats[key].min);
    if (hasValue(stats[key].max)) query = query.lte(`player_stats.${key}`, stats[key].max);
  }
  return query;
}
export function renderStatInputs(mount) {
  mount.replaceChildren();
  const columns = Array.from({ length: 3 }, () => {
    const column = document.createElement('div'); column.className = 'detailed-stat-column';
    mount.append(column); return column;
  });
  let groupIndex = 0;
  for (const [group, keys] of Object.entries(STAT_GROUPS)) {
    const section = document.createElement('section'); section.className = 'detailed-stat-group';
    const heading = document.createElement('h3'); heading.textContent = group;
    section.append(heading);
    for (const key of keys) {
      const row = document.createElement('div'); row.className = 'detailed-stat-row';
      const title = document.createElement('span');
      title.textContent = key.length === 3 ? key.toUpperCase() : key.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
      row.append(title);
      for (const bound of ['min', 'max']) {
        const input = document.createElement('input'); input.type = 'number'; input.id = `${bound}-${key}`;
        input.min = '0'; input.max = '99'; input.step = '1'; input.value = '';
        input.placeholder = bound === 'min' ? '0' : '99';
        input.addEventListener('focus', event => event.target.select());
        input.setAttribute('aria-label', `${key} ${bound}`); row.append(input);
      }
      section.append(row);
    }
    columns[groupIndex++ % columns.length].append(section);
  }
}
