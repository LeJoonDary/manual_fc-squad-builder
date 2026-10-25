/** @typedef {'any' | 'exclude' | 1 | 2 | 3 | 4 | 5} MaxFemalePlayers */
export function validateMaxFemalePlayers(value = 'any') {
  if (!['any', 'exclude', 1, 2, 3, 4, 5].includes(value)) throw new RangeError('Invalid female player limit.');
  return value;
}

export const EXCLUDED_CARD_VERSIONS_STORAGE_KEY = 'fc-squad-builder:excluded-card-versions:v1';

// Normalized cards retain the original card_versions row in raw.
export function getCardVersionId(card) {
  const raw = card?.raw ?? card;
  return normalizeCardVersionId(raw?.version_id ?? raw?.id ?? card?.version_id ?? card?.id);
}

function normalizeCardVersionId(id) {
  if (typeof id !== 'string' && typeof id !== 'number') return null;
  const value = String(id).trim();
  return /^[a-zA-Z0-9_-]+$/.test(value) ? value : null;
}

export function normalizeExcludedCardVersionIds(ids = []) {
  return Array.isArray(ids) ? [...new Set(ids.map(normalizeCardVersionId).filter(Boolean))] : [];
}

export const DEFAULT_SQUAD_OVR_RANGE = Object.freeze({ min: 45, max: 99 });
export function isSquadOvrRangeCustom(range = DEFAULT_SQUAD_OVR_RANGE) {
  return range.min !== DEFAULT_SQUAD_OVR_RANGE.min || range.max !== DEFAULT_SQUAD_OVR_RANGE.max;
}

export function getTotalExcludedCount({ excludedCardVersionIds, maxIcons = null, maxHeroes = null, maxFemalePlayers = 'any' }) {
  return excludedCardVersionIds.length + Number(maxIcons !== null) + Number(maxHeroes !== null)
    + Number(maxFemalePlayers !== 'any');
}

export function getExcludedCardManagementCount(state) {
  return getTotalExcludedCount(state) + Number(isSquadOvrRangeCustom(state.squadOvrRange));
}

export function validateSquadOvrRange(range = DEFAULT_SQUAD_OVR_RANGE) {
  if (!Number.isInteger(range?.min) || !Number.isInteger(range?.max) || range.min < 45 || range.max > 99 || range.min > range.max) {
    throw new RangeError('Auto build OVR range must be between 45 and 99.');
  }
  return { min: range.min, max: range.max };
}

export function validateSpecialCardLimit(value = null) {
  if (value !== null && (!Number.isInteger(value) || value < 0 || value > 5)) {
    throw new RangeError('Special card limits must be Any or a whole number from 0 to 5.');
  }
  return value;
}

export function createExcludedCardVersionsStore(getStorage = () => globalThis.localStorage) {
  const listeners = new Set();
  const makeState = (ids = [], names = {}, range = DEFAULT_SQUAD_OVR_RANGE, maxIcons = null, maxHeroes = null, maxFemalePlayers = 'any') => Object.freeze({
    maxFemalePlayers: validateMaxFemalePlayers(maxFemalePlayers),
    maxIcons: validateSpecialCardLimit(maxIcons), maxHeroes: validateSpecialCardLimit(maxHeroes),
    squadOvrRange: Object.freeze(validateSquadOvrRange(range)),
    excludedCardVersionIds: Object.freeze(normalizeExcludedCardVersionIds(ids)),
    excludedCardVersionNames: Object.freeze(Object.fromEntries(normalizeExcludedCardVersionIds(ids).map(id =>
      [id, typeof names?.[id] === 'string' && names[id].trim() ? names[id] : `Card ${id}`]))),
  });
  let state = makeState();
  // Exclusions live only in memory. Remove old persisted values at app startup.
  for (const key of [EXCLUDED_CARD_VERSIONS_STORAGE_KEY, 'fc-squad-builder:excluded-players:v1']) {
    try { getStorage()?.removeItem(key); }
    catch { /* Blocked storage must not prevent in-memory exclusions from working. */ }
  }

  function update(ids, names, range = state.squadOvrRange, maxIcons = state.maxIcons, maxHeroes = state.maxHeroes, maxFemalePlayers = state.maxFemalePlayers) {
    const next = makeState(ids, names, range, maxIcons, maxHeroes, maxFemalePlayers);
    state = next;
    listeners.forEach(listener => listener());
  }

  return {
    getState: () => state,
    setMaxFemalePlayers(value) { update(state.excludedCardVersionIds, state.excludedCardVersionNames, state.squadOvrRange, state.maxIcons, state.maxHeroes, value); },
    setMaxIcons(value) { update(state.excludedCardVersionIds, state.excludedCardVersionNames, state.squadOvrRange, value); },
    setMaxHeroes(value) { update(state.excludedCardVersionIds, state.excludedCardVersionNames, state.squadOvrRange, state.maxIcons, value); },
    setSquadOvrRange(range) { update(state.excludedCardVersionIds, state.excludedCardVersionNames, range); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    banMany(ids) {
      const existing = new Set(state.excludedCardVersionIds);
      const added = normalizeExcludedCardVersionIds(ids).filter(id => !existing.has(id));
      if (added.length) update([...state.excludedCardVersionIds, ...added], state.excludedCardVersionNames);
      return added.length;
    },
    ban(id, name) {
      id = normalizeCardVersionId(id);
      if (!id) throw new Error('Card version ID is unavailable.');
      if (state.excludedCardVersionIds.includes(id)) return;
      update([...state.excludedCardVersionIds, id], { ...state.excludedCardVersionNames, [id]: name });
    },
    unban(id) {
      id = normalizeCardVersionId(id);
      if (!state.excludedCardVersionIds.includes(id)) return;
      update(state.excludedCardVersionIds.filter(value => value !== id), state.excludedCardVersionNames);
    },
    unbanMany(ids) {
      const removed = new Set(normalizeExcludedCardVersionIds(ids));
      const remaining = state.excludedCardVersionIds.filter(id => !removed.has(id));
      if (remaining.length !== state.excludedCardVersionIds.length) update(remaining, state.excludedCardVersionNames);
    },
    clear() {
      if (getTotalExcludedCount(state)) update([], {}, state.squadOvrRange, null, null, 'any');
    },
    reset() { update([], {}, DEFAULT_SQUAD_OVR_RANGE, null, null, 'any'); },
  };
}

// Shared by the DOM detail panel and React auto-build controls.
export const excludedCardVersionsStore = createExcludedCardVersionsStore();
