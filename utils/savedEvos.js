import { sanitizeCustom, hasCustom } from './slotCustom.js';

export const SAVED_EVOS_KEY = 'metaxi_saved_evos_v1';
export const MAX_SAVED_EVOS = 10;
export const evoCardId = player => String(player?.card_id ?? player?.id ?? player?.api_id ?? '');
export function createSavedEvosStore(storage = () => window.localStorage) {
  /** @type {import('../types/savedEvo').SavedEvoPlayer[]} */
  let entries = [];
  let loaded = false;
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => fn());
  function load() {
    try {
      const data = JSON.parse(storage().getItem(SAVED_EVOS_KEY) ?? '[]');
      const seen = new Set();
      entries = (Array.isArray(data) ? data : []).filter(item => {
        const id = evoCardId(item?.player);
        if (!id || !hasCustom(item.customOverrides) || !Number.isFinite(item.savedAt) || seen.has(id)) return false;
        seen.add(id); return true;
      }).map(item => ({ ...item, id: evoCardId(item.player), customOverrides: sanitizeCustom(item.customOverrides) }))
        .sort((a,b) => b.savedAt - a.savedAt).slice(0, MAX_SAVED_EVOS);
      loaded = true; emit();
    } catch { loaded = true; emit(); }
  }
  function persist(next) {
    if (!loaded) return 'loading';
    try { storage().setItem(SAVED_EVOS_KEY, JSON.stringify(next)); }
    catch { return 'error'; }
    entries = next; emit(); return 'saved';
  }
  return {
    load, get entries() { return entries; }, get loaded() { return loaded; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    save(player, customOverrides) {
      if (!loaded) return 'loading';
      const id = evoCardId(player);
      if (!id || !hasCustom(customOverrides)) return 'error';
      if (!entries.some(item => item.id === id) && entries.length >= MAX_SAVED_EVOS) return 'full';
      try {
        const item = JSON.parse(JSON.stringify({ id, player, customOverrides: sanitizeCustom(customOverrides), savedAt: Date.now() }));
        return persist([item, ...entries.filter(entry => entry.id !== id)]);
      } catch { return 'error'; }
    },
    remove(id) { return persist(entries.filter(item => item.id !== id)); },
  };
}
export const savedEvosStore = createSavedEvosStore();
