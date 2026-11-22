import { normalizeChemistryPosition } from './chemistry.ts';
import { getSwapPlayerId } from './alternativePlayers.js';
// Keep the initial explorer page lean; the existing detail modal loads full stats/traits on demand.
export const EXPLORE_CARD_SELECT = `*, players!inner(*, nations(name, flag_url)), clubs(id,name,logo_url), leagues(id,name,logo_url), card_positions(is_primary,meta_score,positions(name))`;


export const EXPLORE_DRAG_TYPE = 'application/x-squad-explore';
export const initialSquadPanel = search => new URLSearchParams(search).has('s') ? 'build' : 'explore';
export const nextSquadPanel = (current, action) => action === 'explore' ? 'explore'
  : ['select', 'card-action', 'control', 'preset', 'close', 'build'].includes(action) ? 'build' : current;
export function getPrimaryMetaScore(card) {
  const rows = card.raw?.card_positions ?? card.card_positions;
  const value = Array.isArray(rows) ? rows.find(row => row.is_primary === true)?.meta_score : null;
  if (value === null || value === undefined || (typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const score = Number(value);
  return Number.isFinite(score) ? score.toFixed(1) : null;
}
export function pitchPanelAction(target) {
  if (target.closest('#manager-slot, #formation-picker summary, #formation-menu button')) return 'control';
  const slot = target.closest('.pitch .slot');
  if (!slot) return null;
  if (target.closest('.slot-card-actions button')) return 'card-action';
  return slot.classList.contains('occupied') ? null : 'select';
}

export const primaryPosition = card => card.primary_position || card.position;
export const explorePositions = card => [primaryPosition(card), ...(card.alt_positions ?? card.altPositions ?? card.secondary_positions ?? [])].filter(Boolean);
export const canExplorePlay = (card, position) => explorePositions(card).some(p => normalizeChemistryPosition(p) === normalizeChemistryPosition(position));
export function findExploreSlot(squad, positions, card) {
  return positions.find(p => !squad[p]?.card && normalizeChemistryPosition(p) === normalizeChemistryPosition(primaryPosition(card)))
    ?? positions.find(p => !squad[p]?.card && canExplorePlay(card, p));
}
export function placeExplorePlayer(squad, position, card) {
  if (!canExplorePlay(card, position)) return null;
  const next = { ...squad };
  const person = getSwapPlayerId(card);
  for (const [key, entry] of Object.entries(next)) {
    if (entry?.card && ((person !== null && getSwapPlayerId(entry.card) === person) || String(entry.card.id) === String(card.id))) next[key] = null;
  }
  next[position] = { card, isLocked: true, isOwned: false };
  return next;
}
export async function fetchExploreCards(db, tab) {
  if (!db) throw new Error('Database unavailable');
  let query = db.from('card_versions').select(EXPLORE_CARD_SELECT);
  query = tab === 'sbc' ? query.eq('card_type', 'SPECIAL_SBC')
    : query.not('card_type', 'in', '(NORMAL,GOLD,SILVER,BRONZE,RARE_GOLD,RARE_SILVER,RARE_BRONZE)');
  const { data, error } = await query.order('released_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false }).limit(30);
  if (error) throw error;
  return data ?? [];
}
