import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { savedEvosStore, SAVED_EVOS_KEY } from '../utils/savedEvos.js';

export function SavedEvosLifecycle() {
  useEffect(() => {
    savedEvosStore.load();
    const sync = event => { if (event.key === SAVED_EVOS_KEY || event.key === null) savedEvosStore.load(); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return null;
}
export function mountSavedEvos() {
  const host = document.createElement('div'); host.hidden = true; document.body.append(host);
  const root = createRoot(host); root.render(<SavedEvosLifecycle />);
  return () => { root.unmount(); host.remove(); };
}
