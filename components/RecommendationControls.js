import { getLanguage } from '../src/i18n/languageStore';
import { parseBudgetInput, formatBudgetNumber } from '../utils/budget';
export const recommendationText = (ko, en) => getLanguage() === 'ko' ? ko : en;

/** Both slot pickers share formatting, chips, debounce and tab styling. */
export function createRecommendationControls({ mode = 'empty', lockedCount = 1, sort, totalBudget, maxPrice, onSort, onPrice, includeAcquisitionCards = true, onIncludeAcquisitionCards, onInvalidate = () => {} }) {
  const element = document.createElement('div');
  const tabs = document.createElement('div'); tabs.className = 'recommendation-tabs';
  const labels = mode === 'replace' ? [
    ['maintain_chem', recommendationText('✅ 케미 유지/상승', '✅ Maintain / Boost Chem')],
    ['meta_synergy', recommendationText('⚡ 전체 성능+시너지', '⚡ All Meta + Synergy')],
  ] : [
    ['all_meta', recommendationText('🌍 전체 메타', '🌍 All Meta')],
    ['meta_synergy', recommendationText('⚡ 성능+시너지', '⚡ Meta + Synergy')],
    ['chem_boost', recommendationText('🔗 즉시 케미 상승', '🔗 Instant Chem Boost')],
  ];
  let timer;
  const dispose = () => clearTimeout(timer);
  for (const [key, label] of labels) {
    const button = document.createElement('button'); button.type = 'button';
    const icon = document.createElement('span'); icon.className = 'recommendation-tab-icon';
    const split = label.indexOf(' '); icon.textContent = label.slice(0, split + 1);
    button.append(icon, document.createTextNode(label.slice(split + 1)));
    button.disabled = mode === 'empty' && lockedCount === 0 && key !== 'all_meta';
    if (button.disabled) button.title = recommendationText('피치에 선수를 1명 이상 배치하면 활성화됩니다', 'Place 1+ player on the pitch to unlock');
    button.setAttribute('aria-pressed', String(sort === key));
    button.onclick = () => { if (mode === 'empty' && key === sort) return; dispose(); onSort(key); }; tabs.append(button);
  }
  const prices = document.createElement('div'); prices.className = 'recommendation-prices';
  const wrap = document.createElement('label'); wrap.className = 'budget-input-wrap';
  const input = document.createElement('input'); input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = 'off';
  input.placeholder = recommendationText('최대 가격 (C)', 'Max Price (C)'); input.setAttribute('aria-label', input.placeholder);
  input.value = maxPrice == null ? '' : formatBudgetNumber(maxPrice);
  input.onfocus = () => input.select();
  input.oninput = () => {
    const value = input.value.trim() === '' ? undefined : parseBudgetInput(input.value);
    input.value = value === undefined ? '' : formatBudgetNumber(value);
    dispose(); onInvalidate(); timer = setTimeout(() => onPrice(value), 300);
  };
  const unit = document.createElement('span'); unit.textContent = 'C'; wrap.append(input, unit); prices.append(wrap);
  const priceTail = document.createElement('span'); priceTail.className = 'recommendation-price-tail';
  for (const value of [10000, 30000, 50000, 100000, 300000, 500000, 1000000, undefined]) {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = value ? (value === 1000000 ? '1M' : `${value / 1000}K`) : totalBudget
      ? recommendationText('잔여 예산', 'Remaining Budget') : recommendationText('전체', 'All');
    button.onclick = () => { dispose(); onPrice(value); };
    if (value === 500000) prices.append(priceTail);
    (value === 500000 || value === 1000000 || value === undefined ? priceTail : prices).append(button);
  }
  const row = document.createElement('div'); row.className = 'recommendation-controls-row';
  row.append(tabs);
  if (onIncludeAcquisitionCards) {
    const toggle = document.createElement('button'); toggle.type = 'button';
    toggle.className = 'acquisition-toggle slot-chem-switch';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(includeAcquisitionCards));
    const track = document.createElement('span'); track.className = 'slot-chem-switch-track';
    track.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = recommendationText('SBC / OBJ / 토큰 포함', 'Include SBC / OBJ / Token');
    toggle.append(track, label);
    toggle.onclick = () => { dispose(); onIncludeAcquisitionCards(!includeAcquisitionCards); };
    row.append(toggle);
  }
  element.append(row, prices);
  if (mode === 'empty' && lockedCount === 0) {
    const hint = document.createElement('p'); hint.className = 'recommendation-hint';
    hint.textContent = recommendationText('피치에 선수를 1명 이상 배치하면 활성화됩니다', 'Place 1+ player on the pitch to unlock');
    element.append(hint);
  }
  return { element, dispose };
}
export function replacementChemBadge(delta) {
  if (delta === 0) return recommendationText('케미 유지 ✅', 'Chem Kept ✅');
  return `${delta > 0 ? '+' : ''}${delta} ${recommendationText('케미', 'Chem')} ${delta > 0 ? '🔥' : '⚠️'}`;
}

export function emptySlotRecommendationBadge(row, lockedCount) {
  if (!lockedCount) return { text: row.leagueLabel || '', tone: 'is-neutral' };
  if (row.chemDelta > 0) return { text: `+${row.chemDelta} ${recommendationText('케미', 'Chem')} 🔥`, tone: '' };
  if (row.linkName) return { text: `${row.linkName} 🔗`, tone: '' };
  if (row.newLeagueWarning) return { text: recommendationText('새 리그 ⚠️', 'New League ⚠️'), tone: 'is-negative' };
  return { text: row.leagueLabel || '', tone: 'is-neutral' };
}
