export const EXCLUDED_CARD_VERSIONS_STORAGE_KEY = 'fc-squad-builder:excluded-card-versions:v1';

// A separate storage key prevents legacy player IDs from becoming card bans.
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

export function createExcludedCardVersionsStore(getStorage = () => globalThis.localStorage) {
  const listeners = new Set();
  const makeState = (ids = [], names = {}) => Object.freeze({
    excludedCardVersionIds: Object.freeze(normalizeExcludedCardVersionIds(ids)),
    excludedCardVersionNames: Object.freeze(Object.fromEntries(normalizeExcludedCardVersionIds(ids).map(id =>
      [id, typeof names?.[id] === 'string' && names[id].trim() ? names[id] : `카드 ${id}`]))),
  });
  let state = makeState();
  try {
    const saved = JSON.parse(getStorage()?.getItem(EXCLUDED_CARD_VERSIONS_STORAGE_KEY) ?? 'null');
    if (saved) state = makeState(saved.excludedCardVersionIds, saved.excludedCardVersionNames);
  } catch { /* Invalid or unavailable storage must not prevent the app from opening. */ }

  function update(ids, names) {
    const next = makeState(ids, names);
    try {
      const storage = getStorage();
      if (!storage) throw new Error('Storage unavailable');
      storage.setItem(EXCLUDED_CARD_VERSIONS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      throw new Error('제외 목록을 저장하지 못했습니다. 브라우저 저장 공간 및 설정을 확인해 주세요.');
    }
    state = next;
    listeners.forEach(listener => listener());
  }

  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    ban(id, name) {
      id = normalizeCardVersionId(id);
      if (!id) throw new Error('카드 버전 ID를 확인할 수 없습니다.');
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
      if (state.excludedCardVersionIds.length) update([], {});
    },
  };
}

// Shared by the DOM detail panel and React auto-build controls.
export const excludedCardVersionsStore = createExcludedCardVersionsStore();
