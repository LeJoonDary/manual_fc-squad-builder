import { translations } from '../locales/translations';
import { getLanguage } from './languageStore';

// These filters live in the legacy DOM; the language observer shares the same
// store as useTranslation and updates their labels without remounting inputs.
export function createPlayerDbFilterLabel(key: keyof typeof translations.en.playerDb.filters) {
  const label = document.createElement('span');
  label.className = 'command-label';
  label.dataset.i18n = `playerDb.filters.${key}`;
  label.textContent = translations[getLanguage()].playerDb.filters[key];
  return label;
}
