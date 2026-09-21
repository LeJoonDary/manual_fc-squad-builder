import { normalizeExcludedCardVersionIds } from './excludedCardVersions.js';

export const EXCLUSION_SEARCH_PAGE_SIZE = 30;
export const EXCLUSION_CARD_SELECT = 'id,overall,version,image_url,background_url,players!inner(id,name,long_name)';

export async function searchExclusionCards(db, { keyword, offset = 0, signal }) {
  const term = keyword.trim();
  if (!term) return [];
  if (!db) throw new Error('Supabase 연결 설정이 없습니다.');
  const pattern = JSON.stringify(`%${term.replace(/[\\%_]/g, '\\$&')}%`);
  const { data, error } = await db.from('card_versions').select(EXCLUSION_CARD_SELECT)
    .or(`name.ilike.${pattern},long_name.ilike.${pattern}`, { referencedTable: 'players' })
    .order('overall', { ascending: false, nullsFirst: false }).order('id')
    .range(offset, offset + EXCLUSION_SEARCH_PAGE_SIZE - 1).abortSignal(signal);
  if (error) throw error;
  return data ?? [];
}

export async function fetchExcludedCardDetails(db, ids, signal) {
  const uniqueIds = normalizeExcludedCardVersionIds(ids);
  if (!uniqueIds.length) return [];
  if (!db) throw new Error('Supabase 연결 설정이 없습니다.');
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
  return player?.name || player?.long_name || '이름 정보 없음';
}

export function exclusionCardLabel(card) {
  return `${exclusionCardName(card)} · ${card.version || '카드'} (#${card.id})`;
}
