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
    return { formation, players, manager: manager ?? null, budget: Number.isFinite(state.budget) && state.budget >= 0 ? state.budget : 0 };
  } catch { return null; }
}
export function writeSquadState(storage, state) {
  try {
    const players = Object.fromEntries(Object.entries(state.players).map(([slot, entry]) => [slot, entry ? {
      card: entry.originalCard ?? entry.card, customOverrides: sanitizeCustom(entry.customOverrides), isLocked: entry.isLocked === true, isOwned: entry.isOwned === true,
    } : null]));
    storage.setItem(SQUAD_STORAGE_KEY, JSON.stringify({ ...state, players, version: 1 }));
    return true;
  } catch { return false; }
}
