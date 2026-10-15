import { normalizeExcludedCardVersionIds } from './excludedCardVersions.js';
import { playerNamePattern } from './playerSearch.js';

export const EXCLUSION_SEARCH_PAGE_SIZE = 15;
export const EXCLUSION_CARD_SELECT = 'id,overall,version,image_url,background_url,clubs(name),card_positions(is_primary,positions(name)),players!inner(id,name,long_name)';

export async function fetchExclusionCardIdsByOvr(db, { minOvr, maxOvr, signal }) {
  if (!Number.isInteger(minOvr) || !Number.isInteger(maxOvr) || minOvr < 45 || maxOvr > 99 || minOvr > maxOvr) {
    throw new Error('OVR range must be between 45 and 99, with Min OVR no greater than Max OVR.');
  }
  if (!db) throw new Error('Supabase connection is not configured.');
  const ids = [];
  // Continue until an empty page so server row limits cannot silently truncate results.
  for (let offset = 0; ; ) {
    signal?.throwIfAborted();
    const { data, error } = await db.from('card_versions').select('id')
      .gte('overall', minOvr).lte('overall', maxOvr).order('id')
      .range(offset, offset + 499).abortSignal(signal);
    if (error) throw error;
    if (!data?.length) break;
    ids.push(...data.map(card => card.id));
    offset += data.length;
  }
  return normalizeExcludedCardVersionIds(ids);
}

export async function searchExclusionCards(db, { keyword, offset = 0, signal }) {
  const term = keyword.trim();
  if (term.length < 2) return [];
  if (!db) throw new Error('Supabase connection is not configured.');
  signal?.throwIfAborted();
  const pattern = JSON.stringify(playerNamePattern(term));
  const { data, error } = await db.from('card_versions').select(EXCLUSION_CARD_SELECT)
    .or(`name.imatch.${pattern},long_name.imatch.${pattern}`, { referencedTable: 'players' })
    .order('overall', { ascending: false, nullsFirst: false }).order('id')
    .range(offset, offset + EXCLUSION_SEARCH_PAGE_SIZE - 1)
    .limit(EXCLUSION_SEARCH_PAGE_SIZE).abortSignal(signal);
  if (error) throw error;
  return data ?? [];
}

export async function fetchExcludedCardDetails(db, ids, signal) {
  const uniqueIds = normalizeExcludedCardVersionIds(ids);
  if (!uniqueIds.length) return [];
  if (!db) throw new Error('Supabase connection is not configured.');
  const cards = [];
  // Bounded requests avoid URL length and server row-limit truncation for large lists.
  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const batch = uniqueIds.slice(offset, offset + 100);
    const { data, error } = await db.from('card_versions').select(EXCLUSION_CARD_SELECT)
      .in('id', batch).range(0, batch.length - 1).abortSignal(signal);
    if (error) throw error;
    cards.push(...(data ?? []));
  }
  return cards;
}

export function exclusionCardName(card) {
  const player = Array.isArray(card?.players) ? card.players[0] : card?.players;
  return player?.name || player?.long_name || 'Unknown Player';
}

export function exclusionCardLabel(card) {
  return `${exclusionCardName(card)} · ${card.version || 'Card'} (#${card.id})`;
}
