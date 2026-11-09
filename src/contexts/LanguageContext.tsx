'use client';
import React, { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { type Language, translations } from '../locales/translations';
import { getLanguage, setLanguage, subscribeLanguage } from '../i18n/languageStore';
interface LanguageContextProps {
  lang: Language;
  setLang: (lang: Language) => void;
  t: typeof translations['ko'];
}
const LanguageContext = createContext<LanguageContextProps | null>(null);
export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // The app has several React roots and a DOM pitch; all share the same preference.
  const lang = useSyncExternalStore(subscribeLanguage, getLanguage, () => 'en');
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const value = useMemo(() => ({ lang, setLang: setLanguage, t: translations[lang] }), [lang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};
export const useTranslation = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useTranslation must be used within LanguageProvider');
  return context;
};
