import { ui } from '../src/i18n/languageStore';

export function createSlotPhysicalControls({ value = {}, onChange }) {
  let current = structuredClone(value);
  const root = document.createElement('div'); root.className = 'tactical-physical';
  const update = (key, value) => { current = { ...current, [key]: value }; onChange(structuredClone(current)); };
  const group = (label, className = '') => {
    const fieldset = document.createElement('fieldset'); fieldset.className = className;
    const legend = document.createElement('legend'); legend.textContent = ui(label); fieldset.append(legend);
    return fieldset;
  };
  const choices = (label, key, values, multiple = false, className = '') => {
    const fieldset = group(label, className);
    const row = document.createElement('div'); row.className = 'tactical-physical-choices';
    const selected = option => multiple ? (current[key] ?? []).includes(option) : current[key] === option;
    for (const option of values) {
      const button = document.createElement('button'); button.type = 'button';
      button.dataset.physical = key; button.dataset.value = option;
      button.textContent = ui(option); button.setAttribute('aria-pressed', String(selected(option)));
      button.onclick = () => {
        update(key, multiple ? selected(option) ? current[key].filter(item => item !== option) : [...(current[key] ?? []), option]
          : selected(option) ? '' : option);
        row.querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed', String(selected(node.dataset.value))));
      };
      row.append(button);
    }
    fieldset.append(row); return fieldset;
  };
  root.append(choices('Accelerate Type', 'acceleTypes', ['Explosive', 'Lengthy', 'Controlled'], true));
  const pair = document.createElement('div'); pair.className = 'tactical-physical-pair';
  pair.append(choices('Strong Foot', 'preferredFoot', ['Left', 'Right']), choices('Gender', 'gender', ['Male', 'Female']));
  root.append(pair, choices('Body Type', 'bodyTypes',
    ['Lean', 'Average', 'Stocky'].flatMap(type => ['Short', 'Medium', 'Tall'].map(size => `${type} ${size}`)).concat('Unique'), true, 'tactical-body-types'));
  const ranges = document.createElement('div'); ranges.className = 'tactical-physical-pair';
  for (const [name, unit] of [['Height', 'cm'], ['Weight', 'kg']]) {
    const fieldset = group(`${name} (${unit})`);
    const row = document.createElement('div'); row.className = 'tactical-physical-pair';
    for (const bound of ['min', 'max']) {
      const key = bound + name;
      const label = document.createElement('label'); label.textContent = ui(bound === 'min' ? 'Min' : 'Max');
      const input = document.createElement('input'); input.type = 'number'; input.inputMode = 'numeric'; input.min = '0'; input.step = '1';
      input.dataset.physical = key; input.value = current[key] ?? ''; input.placeholder = ui('Any');
      input.setAttribute('aria-label', `${ui(name)} ${ui(bound === 'min' ? 'Min' : 'Max')} (${unit})`);
      input.oninput = () => {
        update(key, input.value === '' ? '' : input.valueAsNumber);
        const min = current['min' + name], max = current['max' + name];
        const invalid = min !== '' && min != null && max !== '' && max != null && min > max;
        row.querySelectorAll('input').forEach(node => node.setAttribute('aria-invalid', String(invalid || !node.validity.valid)));
      };
      label.append(input); row.append(label);
    }
    fieldset.append(row); ranges.append(fieldset);
  }
  root.append(ranges);
  return root;
}
