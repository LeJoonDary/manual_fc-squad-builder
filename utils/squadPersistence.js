import { sanitizeCustom } from './slotCustom.js';
export const SQUAD_STORAGE_KEY = 'metaxi_squad_state_v1';
export function readSquadState(storage, formations) {
  try {
    const state = JSON.parse(storage.getItem(SQUAD_STORAGE_KEY));
    const formation = formations.find(f => f.name === state?.formation);
    if (state?.version !== 1 || !formation || !state.players || typeof state.players !== 'object' || Array.isArray(state.players)) return null;
    const players = {};
    for (const { position } of formation.slots) {
      const entry = state.players[position];
      if (!entry) { players[position] = null; continue; }
      if (!entry.card || typeof entry.card !== 'object' || !['number','string'].includes(typeof entry.card.id)) return null;
      if (!String(entry.card.id).trim()) return null;
      for (const key of ['secondary_positions', 'card_positions', 'altPositions']) {
        if (entry.card[key] != null && !Array.isArray(entry.card[key])) return null;
      }
      const customOverrides = sanitizeCustom(entry.customOverrides);
      players[position] = { card: entry.card, originalCard: entry.card, customOverrides, isLocked: entry.isLocked === true, isOwned: entry.isOwned === true };
    }
    const manager = state.manager;
    if (manager && (typeof manager !== 'object' || typeof manager.league !== 'string' || typeof manager.nation !== 'string')) return null;
    const budget = state.maxBudget ?? state.budget;
    return { formation, players, manager: manager ?? null,
      budget: Number.isFinite(budget) && budget >= 0 ? budget : 0,
      minChemistry: Number.isInteger(state.minChemistry) && state.minChemistry >= 20 && state.minChemistry <= 33 ? state.minChemistry : 33,
      excludedCards: state.excludedCards && typeof state.excludedCards === 'object' ? state.excludedCards : {},
      advancedSettings: state.advancedSettings && typeof state.advancedSettings === 'object' ? state.advancedSettings : {},
    };
  } catch { return null; }
}
export function writeSquadState(storage, state) {
  try {
    const players = Object.fromEntries(Object.entries(state.players).map(([slot, entry]) => [slot, entry ? {
      card: entry.originalCard ?? entry.card, customOverrides: sanitizeCustom(entry.customOverrides), isLocked: entry.isLocked === true, isOwned: entry.isOwned === true,
    } : null]));
    storage.setItem(SQUAD_STORAGE_KEY, JSON.stringify({ ...state, players, version: 1 }, (_, value) => value instanceof Set ? [...value] : value));
    return true;
  } catch { return false; }
}

// Calls before restoration are intentionally ignored, including unload flushes.
export function createSquadAutosave(write, delay = 175) {
  let hydrated = false, timer = null;
  const flush = () => {
    clearTimeout(timer); timer = null;
    if (!hydrated) return;
    try { write(); } catch { /* Unavailable or full storage is non-fatal. */ }
  };
  return {
    hydrate() { hydrated = true; },
    schedule() { if (!hydrated) return; clearTimeout(timer); timer = setTimeout(flush, delay); },
    flush,
  };
}
