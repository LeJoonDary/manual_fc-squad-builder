import { PLAYER_CARD_SELECT } from './playerCards.js';
import { FORMATIONS } from './formations.js';
/** Prepare everything before mutating the pitch; one full-detail query, no saved-slot writes. */
export async function loadSharedSquadCards(db, payload, normalize) {
  const ids = [...new Set(payload.slots.filter(Boolean).map(slot => slot.cardVersionId))];
  let rows = [];
  if (ids.length) {
    if (!db) throw new Error('Database unavailable');
    const { data, error } = await db.from('card_versions').select(PLAYER_CARD_SELECT).in('id', ids);
    if (error) throw error;
    rows = data ?? [];
  }
  const cards = new Map(rows.map(row => [String(row.id), normalize(row)]));
  if (ids.some(id => !cards.get(id))) throw new Error('Shared card unavailable');
  const formation = FORMATIONS.find(f => f.name === payload.formation);
  if (!formation) throw new Error('Invalid formation');
  return Object.fromEntries(formation.slots.map(({ position }, i) => {
    const entry = payload.slots[i];
    return [position, entry ? { card: cards.get(entry.cardVersionId), isLocked: entry.isLocked, isOwned: entry.isOwned } : null];
  }));
}
