// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { detectLanguage, formatMessage, getLanguage, setLanguage, translateMessage } from './languageStore';
import { mountDomTranslations } from './domTranslations';
import { LanguageProvider, useTranslation } from '../contexts/LanguageContext';
import { LanguageToggle } from '../components/LanguageToggle';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { localStorage.clear(); setLanguage('en', false); });
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

it.each(['ko', 'ko-KR', 'KO-kr', 'en-US', 'ja-JP'])('detects browser %s and honors a saved preference', language => {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(language);
  expect(detectLanguage()).toBe(language.toLowerCase().startsWith('ko') ? 'ko' : 'en');
  localStorage.setItem('metaxi_lang', 'en');
  expect(detectLanguage()).toBe('en');
  localStorage.setItem('metaxi_lang', 'invalid');
  expect(detectLanguage()).toBe(language.toLowerCase().startsWith('ko') ? 'ko' : 'en');
});

it('persists manual changes and survives unavailable storage', () => {
  setLanguage('ko');
  expect(localStorage.getItem('metaxi_lang')).toBe('ko');
  expect(document.documentElement.lang).toBe('ko');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(() => setLanguage('en')).not.toThrow();
  expect(getLanguage()).toBe('en');
});

it('formats messages without translating player data or HTML interpolation', () => {
  expect(formatMessage('{count} {name}', { count: 11, name: '<b>Pedri</b>' })).toBe('11 <b>Pedri</b>');
  expect(translateMessage('Added Pedri at CM.', 'ko')).toContain('Pedri');
  for (const name of ['Pinged Pass', 'Finesse Shot', 'Box to Box', 'Falseback', 'ST', 'CM', 'PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY']) {
    expect(translateMessage(name, 'ko')).toBe(name);
  }
});

it('updates legacy UI in place, preserves focus/values and translates new messages', async () => {
  document.body.innerHTML = '<button>Clear All</button><input placeholder="Search player name..."><p id="status">Select a position to add a player.</p><span data-i18n-protected>Manager</span><span>Pinged Pass</span>';
  const stop = mountDomTranslations();
  try {
    const input = document.querySelector('input')!;
    input.value = 'Pedri'; input.focus();
    setLanguage('ko');
    expect(input.placeholder).toBe('선수 이름 검색...');
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('Pedri');
    expect(document.querySelector('[data-i18n-protected]')!.textContent).toBe('Manager');
    document.querySelector('#status')!.textContent = 'Added Pedri at CM.';
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(document.querySelector('#status')!.textContent).toBe('CM에 Pedri 선수를 배치했습니다.');
    setLanguage('en');
    expect(document.querySelector('#status')!.textContent).toBe('Added Pedri at CM.');
    expect(input.placeholder).toBe('Search player name...');
  } finally { stop(); }
});

it('synchronizes separate React roots without resetting form state', async () => {
  const first = document.createElement('div'), second = document.createElement('div');
  document.body.append(first, second);
  const a = createRoot(first), b = createRoot(second);
  const Form = () => { const { t } = useTranslation(); return <><h2>{t.modals.advancedTitle}</h2><input defaultValue="Pinged Pass" /></>; };
  try {
    await act(async () => { a.render(<LanguageProvider><LanguageToggle /></LanguageProvider>); b.render(<LanguageProvider><Form /></LanguageProvider>); });
    const input = second.querySelector('input')!; input.value = 'Box to Box';
    await act(async () => first.querySelector('button')!.click());
    expect(second.querySelector('h2')!.textContent).toBe('고급 조건 설정');
    expect(second.querySelector('input')).toBe(input);
    expect(input.value).toBe('Box to Box');
    expect(localStorage.getItem('metaxi_lang')).toBe('ko');
    await act(async () => first.querySelectorAll('button')[1].click());
    expect(second.querySelector('h2')!.textContent).toBe('Advanced Builder Settings');
  } finally { await act(async () => { a.unmount(); b.unmount(); }); }
});
