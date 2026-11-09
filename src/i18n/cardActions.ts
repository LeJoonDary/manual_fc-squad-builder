import { translations } from '../locales/translations';
import { getLanguage } from './languageStore';

export function setCardAction(button: HTMLElement, key: keyof typeof translations.en.cardActions) {
  if (button.dataset.i18nCardAction !== key) button.dataset.i18nCardAction = key;
  const label = translations[getLanguage()].cardActions[key];
  for (const attribute of ['title', 'data-tooltip', 'aria-label']) {
    if (button.getAttribute(attribute) !== label) button.setAttribute(attribute, label);
  }
}
