import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';

const STORAGE_KEY = 'hideMetaXiGuide';
function readPreference() {
  try { return localStorage.getItem(STORAGE_KEY) !== null; }
  catch { return false; }
}

export function GuideModal({ onClose }) {
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

  return createPortal(<dialog ref={dialog} className="guide-modal" aria-labelledby="guide-title"
    onCancel={event => { event.preventDefault(); close(); }}>
    <header className="modal-header">
      <h2 id="guide-title">META XI Quick Guide</h2>
      <button type="button" className="modal-close" aria-label="Close guide" onClick={close}>×</button>
    </header>
    <div className="guide-video">
      <iframe src="https://www.youtube.com/embed/4SWZx9PyVEQ" title="META XI Quick Guide video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
    </div>
    <footer className="guide-footer">
      <label><input type="checkbox" checked={dontShowAgain} onChange={event => setDontShowAgain(event.target.checked)} /> Don't show again</label>
      <button type="button" className="guide-close-button" onClick={close}>Close</button>
    </footer>
  </dialog>, document.body);
}

export function GuideControl() {
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  useEffect(() => { if (!readPreference()) setIsGuideOpen(true); }, []);
  return <>
    <button type="button" className="nav-tab guide-trigger" aria-haspopup="dialog"
      aria-expanded={isGuideOpen} onClick={() => setIsGuideOpen(true)}>Guide</button>
    {isGuideOpen && <GuideModal onClose={() => setIsGuideOpen(false)} />}
  </>;
}

export function mountGuideControl(container) {
  if (!container) return;
  const root = createRoot(container);
  root.render(<GuideControl />);
  return () => root.unmount();
}
