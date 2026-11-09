'use client';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider, useTranslation } from '../contexts/LanguageContext';
export const LanguageToggle = () => {
  const { lang, setLang } = useTranslation();
  return <div className="language-toggle" role="group" aria-label={lang === 'ko' ? '언어 선택' : 'Language'} data-i18n-react>
    <button type="button" lang="ko" aria-label="한국어" aria-pressed={lang === 'ko'} onClick={() => setLang('ko')}>🇰🇷 KO</button>
    <button type="button" lang="en" aria-label="English" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>🇺🇸 EN</button>
  </div>;
};
export function mountLanguageToggle(container: HTMLElement) {
  const root = createRoot(container);
  root.render(<LanguageProvider><LanguageToggle /></LanguageProvider>);
  return () => root.unmount();
}
