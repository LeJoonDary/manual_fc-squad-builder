import { STAT_GROUPS, activeStats } from '../utils/statFilters.js';
import { ui } from '../src/i18n/languageStore';

export function createSlotDetailedStats({ value = {}, position, onChange }) {
  let current = structuredClone(value);
  const root = document.createElement('div'); root.className = 'tactical-detailed-stats';
  const groups = Object.entries(STAT_GROUPS);
  if (position === 'GK') groups.sort(([a], [b]) => Number(b === 'GOALKEEPING') - Number(a === 'GOALKEEPING'));
  for (const [group, keys] of groups) {
    const wrapper = document.createElement('section'); wrapper.className = 'tactical-stat-section';
    const details = document.createElement('details'); details.open = group === (position === 'GK' ? 'GOALKEEPING' : 'PACE');
    const summary = document.createElement('summary'); summary.append(document.createTextNode(ui(group)));
    const count = document.createElement('span'); count.className = 'tactical-count'; summary.append(count);
    const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'tactical-stat-reset';
    reset.textContent = ui('Clear'); reset.setAttribute('aria-label', `${ui(group)} ${ui('Clear')}`);
    const update = () => {
      const n = activeStats(current).filter(key => keys.includes(key)).length;
      count.textContent = String(n); count.hidden = !n; reset.disabled = !n;
      onChange(structuredClone(current));
    };
    const inputs = [];
    details.append(summary);
    const headings = document.createElement('div'); headings.className = 'detailed-stat-row tactical-stat-headings';
    for (const text of ['', ui('Min'), ui('Max')]) { const label = document.createElement('span'); label.textContent = text; headings.append(label); }
    details.append(headings);
    for (const key of keys) {
      const row = document.createElement('div'); row.className = 'detailed-stat-row';
      const title = document.createElement('span');
      const name = key.length === 3 ? key.toUpperCase() : key.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
      title.textContent = ui(name); row.append(title);
      for (const bound of ['min', 'max']) {
        const input = document.createElement('input'); input.type = 'number'; input.inputMode = 'numeric'; input.min = '0'; input.max = '99'; input.step = '1';
        input.value = current[key]?.[bound] ?? ''; input.placeholder = bound === 'min' ? '0' : '99';
        input.dataset.stat = key; input.dataset.bound = bound; input.setAttribute('aria-label', `${ui(name)} ${ui(bound === 'min' ? 'Min' : 'Max')}`);
        input.oninput = () => {
          const range = { ...current[key] };
          if (input.value === '') delete range[bound];
          else {
            const number = Math.max(0, Math.min(99, Math.round(input.valueAsNumber)));
            if (!Number.isFinite(number)) return;
            range[bound] = number;
          }
          if (Object.keys(range).length) current[key] = range; else delete current[key];
          row.querySelectorAll('input').forEach(node => node.setAttribute('aria-invalid', String(range.min != null && range.max != null && range.min > range.max)));
          update();
        };
        input.onchange = () => { input.value = current[key]?.[bound] ?? ''; };
        inputs.push(input); row.append(input);
      }
      details.append(row);
    }
    reset.onclick = () => { keys.forEach(key => delete current[key]); inputs.forEach(input => { input.value = ''; input.removeAttribute('aria-invalid'); }); update(); };
    const n = activeStats(current).filter(key => keys.includes(key)).length;
    count.textContent = String(n); count.hidden = !n; reset.disabled = !n;
    wrapper.append(details, reset); root.append(wrapper);
  }
  return root;
}
