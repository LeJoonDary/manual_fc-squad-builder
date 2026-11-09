import { LanguageProvider, useTranslation } from '../src/contexts/LanguageContext';
import { ui } from '../src/i18n/languageStore';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';

const STORAGE_KEY = 'metaxi_guide_seen_v2';
const VIDEO_IDS = { ko: 'nwbDLox9DHU', en: 'HOz_OeMgC68' };
function readPreference() {
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; }
  catch { return false; }
}

export function GuideModal({ onClose, language, onLanguageChange }) {
  const dialog = useRef(null);
  const [dontShowAgain, setDontShowAgain] = useState(readPreference);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.current.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  function close() {
    try {
      if (dontShowAgain) localStorage.setItem(STORAGE_KEY, 'true');
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* Unavailable storage must not prevent closing the guide. */ }
    onClose();
  }

  return createPortal(<dialog data-i18n-react ref={dialog} className="guide-modal" aria-labelledby="guide-title"
    onCancel={event => { event.preventDefault(); close(); }}>
    <header className="modal-header">
      <h2 id="guide-title">{ui('META XI Quick Guide')}</h2>
      <div className="guide-header-actions">
        <div className="guide-language-toggle" role="group" aria-label={ui('Guide language')}>
          {['en', 'ko'].map(code => <button key={code} type="button"
            aria-pressed={language === code} onClick={() => onLanguageChange(code)}>
            {code === 'ko' ? '한국어' : 'English'}
          </button>)}
        </div>
        <button type="button" className="modal-close" aria-label={ui('Close guide')} onClick={close}>×</button>
      </div>
    </header>
    <div className="guide-video aspect-video">
      <iframe key={language} src={`https://www.youtube.com/embed/${VIDEO_IDS[language]}`} title={`META XI Quick Guide video (${language === 'ko' ? '한국어' : 'English'})`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
    </div>
    <footer className="guide-footer">
      <label><input type="checkbox" checked={dontShowAgain} onChange={event => setDontShowAgain(event.target.checked)} /> {language === 'ko' ? '다시 보지 않기' : "Don't show again"}</label>
      <button type="button" className="guide-close-button" onClick={close}>{language === 'ko' ? '닫기' : 'Close'}</button>
    </footer>
  </dialog>, document.body);
}

export function GuideControl() {
  return <LanguageProvider><GuideControlContent /></LanguageProvider>;
}
function GuideControlContent() {
  const { lang: language, setLang: changeLanguage, t } = useTranslation();
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  useEffect(() => { if (!readPreference()) setIsGuideOpen(true); }, []);
  return <>
    <button data-i18n-react type="button" className="nav-tab guide-trigger" aria-haspopup="dialog"
      aria-expanded={isGuideOpen} onClick={() => setIsGuideOpen(true)}>{t.nav.guide}</button>
    {isGuideOpen && <GuideModal language={language} onLanguageChange={changeLanguage} onClose={() => setIsGuideOpen(false)} />}
  </>;
}

export function mountGuideControl(container) {
  if (!container) return;
  const root = createRoot(container);
  root.render(<GuideControl />);
  return () => root.unmount();
}
