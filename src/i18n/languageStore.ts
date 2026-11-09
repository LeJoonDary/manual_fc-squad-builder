import { type Language, translations } from '../locales/translations';
import { uiTranslations } from '../locales/ui';
export const LANGUAGE_KEY = 'metaxi_lang';
let language: Language | undefined;
const listeners = new Set<() => void>();
export function detectLanguage(): Language {
  try {
    const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem(LANGUAGE_KEY);
    if (saved === 'ko' || saved === 'en') return saved;
  } catch { /* Private mode must not disable the toggle. */ }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}
export const getLanguage = (): Language => language ??= detectLanguage();
export const subscribeLanguage = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function setLanguage(next: Language, persist = true) {
  if (next !== 'ko' && next !== 'en') return;
  language = next;
  if (persist) try { localStorage.setItem(LANGUAGE_KEY, next); } catch { /* Keep the in-memory preference. */ }
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  listeners.forEach(listener => listener());
}
export function startLanguageSync() {
  setLanguage(detectLanguage(), false);
  const onStorage = (event: StorageEvent) => {
    if (event.key === LANGUAGE_KEY || event.key === null) setLanguage(detectLanguage(), false);
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
export function formatMessage(template: string, params: Record<string, string | number> = {}) {
  return template.replace(/\{(\w+)\}/g, (token, key) => Object.hasOwn(params, key) ? String(params[key]) : token);
}
const messages = new Map<string, string>();
function collect(en: Record<string, any>, ko: Record<string, any>) {
  for (const key of Object.keys(en)) {
    if (typeof en[key] === 'string') messages.set(en[key], ko[key]);
    else collect(en[key], ko[key]);
  }
}
collect(translations.en, translations.ko);
for (const [en, ko] of Object.entries(uiTranslations)) messages.set(en, ko);
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = [...messages].filter(([key]) => /\{\w+\}/.test(key)).map(([en, ko]) => {
  const keys: string[] = [];
  let cursor = 0, pattern = '';
  for (const match of en.matchAll(/\{(\w+)\}/g)) {
    pattern += escape(en.slice(cursor, match.index)) + '(.+?)';
    keys.push(match[1]); cursor = match.index! + match[0].length;
  }
  return { regex: new RegExp('^' + pattern + escape(en.slice(cursor)) + '$', 's'), keys, ko };
});
/** Only registered UI messages are translated. Player, role and Playstyle data are never dictionary entries. */
export function translateMessage(source: string, lang: Language = getLanguage()): string {
  if (lang === 'en') return source;
  const trimmed = source.trim();
  let translated = messages.get(trimmed);
  if (translated === undefined) for (const pattern of patterns) {
    const match = trimmed.match(pattern.regex);
    if (match) { translated = formatMessage(pattern.ko, Object.fromEntries(pattern.keys.map((key, i) => [key, match[i + 1]]))); break; }
  }
  return translated === undefined ? source : source.replace(trimmed, () => translated!);
}
export function ui(source: string, params: Record<string, string | number> = {}) {
  return formatMessage(translateMessage(source), params);
}
