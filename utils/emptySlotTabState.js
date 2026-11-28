const STORAGE_KEY = 'metaxi_preferred_select_tab_v1';
const TABS = ['all_meta', 'meta_synergy', 'chem_boost'];

/** Player Select preference stays separate from replacement tabs and fallback. */
export function createEmptySlotTabState() {
  let preferredSelectTab = 'all_meta';
  let storage;
  return {
    restore(getStorage = () => window.localStorage) {
      try {
        storage = getStorage();
        const saved = storage.getItem(STORAGE_KEY);
        if (TABS.includes(saved)) preferredSelectTab = saved;
      } catch { /* Storage may be unavailable; retain the in-memory default. */ }
    },
    active(lockedCount) {
      return lockedCount ? preferredSelectTab : 'all_meta';
    },
    select(tab, lockedCount) {
      if (TABS.includes(tab)) {
        preferredSelectTab = tab;
        try { storage?.setItem(STORAGE_KEY, tab); } catch { /* Keep session preference. */ }
      }
      return this.active(lockedCount);
    },
  };
}
