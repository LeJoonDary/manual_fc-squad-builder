import { getLanguage } from '../src/i18n/languageStore';
import { parseBudgetInput, formatBudgetNumber } from '../utils/budget';
export const recommendationText = (ko, en) => getLanguage() === 'ko' ? ko : en;

/** Both slot pickers share formatting, chips, debounce and tab styling. */
export function createRecommendationControls({ mode = 'empty', sort, totalBudget, maxPrice, onSort, onPrice, onInvalidate = () => {} }) {
  const element = document.createElement('div');
  const tabs = document.createElement('div'); tabs.className = 'recommendation-tabs';
  const labels = mode === 'replace' ? [
    ['maintain_chem', recommendationText('✅ 케미 유지/상승', '✅ Maintain / Boost Chem')],
    ['meta_synergy', recommendationText('⚡ 전체 성능+시너지', '⚡ All Meta + Synergy')],
  ] : [
    ['meta_synergy', recommendationText('⚡ 성능+시너지 추천', '⚡ Meta + Synergy')],
    ['instant_chem', recommendationText('🔗 즉시 케미 상승', '🔗 Instant Chem Boost')],
  ];
  let timer;
  const dispose = () => clearTimeout(timer);
  for (const [key, label] of labels) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.setAttribute('aria-pressed', String(sort === key));
    button.onclick = () => { dispose(); onSort(key); }; tabs.append(button);
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
  for (const value of [10000, 30000, 50000, 100000, 300000, 500000, 1000000, undefined]) {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = value ? (value === 1000000 ? '1M' : `${value / 1000}K`) : totalBudget
      ? recommendationText('잔여 예산', 'Remaining Budget') : recommendationText('전체', 'All');
    button.onclick = () => { dispose(); onPrice(value); }; prices.append(button);
  }
  element.append(tabs, prices);
  return { element, dispose };
}
export function replacementChemBadge(delta) {
  if (delta === 0) return recommendationText('케미 유지 ✅', 'Chem Kept ✅');
  return `${delta > 0 ? '+' : ''}${delta} ${recommendationText('케미', 'Chem')} ${delta > 0 ? '🔥' : '⚠️'}`;
}
