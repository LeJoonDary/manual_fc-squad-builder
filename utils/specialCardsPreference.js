export const INCLUDE_SPECIAL_CARDS_KEY = 'metaxi_include_special_cards_v1';

export function createSpecialCardsPreference(storage = () => window.localStorage) {
  let value = true;
  return {
    get value() { return value; },
    hydrate() {
      try { value = storage().getItem(INCLUDE_SPECIAL_CARDS_KEY) !== 'false'; }
      catch { /* Keep the default when browser storage is unavailable. */ }
    },
    set(nextValue) {
      value = nextValue;
      try { storage().setItem(INCLUDE_SPECIAL_CARDS_KEY, String(nextValue)); }
      catch { /* The in-memory setting still works in restricted browsers. */ }
    },
  };
}
