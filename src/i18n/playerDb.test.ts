// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { createPlayerDbFilterLabel } from './playerDb';
import { mountDomTranslations } from './domTranslations';
import { formatMessage, setLanguage } from './languageStore';
import { translations } from '../locales/translations';

afterEach(() => { document.body.replaceChildren(); setLanguage('en', false); });

it('translates every DB filter label and preserves its host when toggling languages', () => {
  setLanguage('en', false);
  for (const key of Object.keys(translations.en.playerDb.filters)) {
    const button = document.createElement('button');
    button.setAttribute('aria-expanded', 'true');
    button.append(createPlayerDbFilterLabel(key as keyof typeof translations.en.playerDb.filters));
    document.body.append(button);
  }
  const buttons = [...document.querySelectorAll('button')];
  const stop = mountDomTranslations();
  try {
    for (const language of ['ko', 'en', 'ko'] as const) {
      setLanguage(language, false);
      expect(buttons.map(button => button.textContent)).toEqual(Object.values(translations[language].playerDb.filters));
      expect([...document.querySelectorAll('button')]).toEqual(buttons);
      expect(buttons.every(button => button.getAttribute('aria-expanded') === 'true')).toBe(true);
    }
  } finally { stop(); }
});

it('translates the real position panel and reset buttons without changing filter values or names', async () => {
  const html = readFileSync('index.html', 'utf8');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.body.append(document.importNode(parsed.querySelector('#players-page')!, true));
  const primary = document.querySelector<HTMLInputElement>('#only-primary-positions')!;
  const all = document.querySelector<HTMLInputElement>('#has-all-selected-positions')!;
  primary.checked = true; all.checked = true;
  const position = document.querySelector<HTMLElement>('[data-position-filter="CM"]')!;
  position.setAttribute('aria-pressed', 'true');
  const protectedNames = document.createElement('div');
  protectedNames.innerHTML = '<span class="role-name-chip">Box to Box</span><span class="playstyle-badge">Pinged Pass</span>';
  document.body.append(protectedNames);
  const stop = mountDomTranslations();
  try {
    for (const language of ['ko', 'en'] as const) {
      setLanguage(language, false);
      const t = translations[language].playerDb;
      expect(document.querySelector('.mini-pitch-kicker')!.textContent).toBe(t.positionModal.title);
      expect(document.querySelector('.mini-pitch-heading strong')!.textContent).toBe(t.positionModal.subtitle);
      expect(primary.parentElement!.textContent).toContain(t.positionModal.onlyPrimary);
      expect(all.parentElement!.textContent).toContain(t.positionModal.hasAllSelected);
      expect(document.querySelector('#clear-all-filters')!.textContent).toBe(t.resetAll);
      expect(document.querySelector('#mobile-clear-all-filters')!.textContent).toBe(t.resetAll);
      expect(primary.checked && all.checked).toBe(true);
      expect(position.textContent).toBe('CM');
      expect(position.getAttribute('aria-pressed')).toBe('true');
      expect(protectedNames.textContent).toBe('Box to BoxPinged Pass');
    }
    const result = document.querySelector('#players-result-count')!;
    result.textContent = formatMessage(translations.en.playerDb.resultCount, { current: 15, total: 100 });
    await new Promise(resolve => setTimeout(resolve, 0));
    setLanguage('ko', false);
    expect(result.textContent).toBe('전체 100명 중 15명 표시');
    setLanguage('en', false);
    expect(result.textContent).toBe('Showing 15 of 100 players');
  } finally { stop(); }
});
