import { PLAYER_CARD_SELECT } from './playerCards.js';
import { PLAYER_PAGE_SIZE } from './playerPagination.js';
import { playerNamePattern, createPlayerNameMatcher, preparePlayerSearch } from './playerSearch.js';

// Related data is fetched only for a bounded visible page, never all cards.
export const PLAYER_LIST_SELECT = `
  id,player_id,overall,price,background_url,version,club_id,league_id,sm,wf,preferred_foot,
  players!inner(id,name,long_name,nation_id,nations(name,flag_url)),
  clubs(id,name),leagues(id,name),card_positions(is_primary,positions(name)),
  player_stats(pac,sho,pas,dri,def,phy),
  card_roles(role_level,roles(position,role_name)),
  card_playstyles(playstyle_id,is_plus,playstyles(id,name,image_url,image_url_plus))
`;
const detailCaches = new WeakMap();
const pageCaches = new WeakMap();

// Share in-flight requests and keep a small cache of complete rendered pages.
export async function cachedPlayerPage(db, key, load, signal) {
  if (!db) throw new Error('Supabase connection is not configured.');
  signal?.throwIfAborted();
  if (!pageCaches.has(db)) pageCaches.set(db, new Map());
  const cache = pageCaches.get(db);
  if (!cache.has(key)) {
    const pending = Promise.resolve().then(load);
    cache.set(key, pending);
    pending.catch(() => { if (cache.get(key) === pending) cache.delete(key); });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
  }
  const rows = await cache.get(key);
  signal?.throwIfAborted();
  return rows;
}

export function fetchPlayerListPage(db, { keyword = '', position = null, positionMode = 'all', offset = 0, limit = PLAYER_PAGE_SIZE, signal } = {}) {
  const pageSize = Math.min(50, Math.max(1, limit));
  const term = keyword.trim();
  const key = JSON.stringify(['list', term, position, positionMode, offset, pageSize]);
  return cachedPlayerPage(db, key, async () => {
    const matches = [];
    const matchName = createPlayerNameMatcher(term);
    const playerIds = term ? await findPlayerNameIds(db, term) : null;
    if (playerIds?.length === 0) return [];
    for (let scanned = term ? 0 : offset; ;) {
      let query = db.from('card_versions').select(PLAYER_LIST_SELECT
        + (position ? ',slot_positions:card_positions!inner(is_primary,positions!inner(name))' : ''));
      query = playerIds ? query.in('player_id', playerIds) : applyPlayerNameQuery(query, term);
      if (position) {
        query.eq('slot_positions.positions.name', position);
        if (positionMode === 'primary' || positionMode === 'secondary') query.eq('slot_positions.is_primary', positionMode === 'primary');
      }
      const { data, error } = await query
        .order('overall', { ascending: false, nullsFirst: false }).order('id')
        .range(scanned, scanned + pageSize - 1).limit(pageSize);
      if (error) throw error;
      for (const row of data ?? []) {
        const player = Array.isArray(row.players) ? row.players[0] : row.players;
        if (!term || matchName(preparePlayerSearch(player ?? {}))) matches.push({ ...row, summary_only: true });
      }
      if (!term) return matches;
      if (matches.length >= offset + pageSize || !data?.length) return matches.slice(offset, offset + pageSize);
      // A full candidate page can include regex false positives. Continue until
      // the requested normalized-match page is filled, or candidates end.
      if (data.length < pageSize) return matches.slice(offset, offset + pageSize);
      scanned += data.length;
    }
  }, signal);
}

// Filter a small flat table before querying card relations. For broad input,
// fall back to a paged joined filter rather than building an unbounded IN URL.
export function findPlayerNameIds(db, keyword) {
  return cachedPlayerPage(db, JSON.stringify(['names', keyword.trim()]), async () => {
    const pattern = JSON.stringify(playerNamePattern(keyword));
    const { data, error } = await db.from('players').select('id,name,long_name')
      .or(`name.imatch.${pattern},long_name.imatch.${pattern}`).order('id').limit(201);
    if (error) throw error;
    if (data?.length >= 201) return null;
    const matchesName = createPlayerNameMatcher(keyword);
    return (data ?? []).filter(player => matchesName(preparePlayerSearch(player))).map(player => player.id);
  });
}

export function applyPlayerNameQuery(query, keyword) {
  if (!keyword.trim()) return query;
  const pattern = JSON.stringify(playerNamePattern(keyword));
  return query.or(`name.imatch.${pattern},long_name.imatch.${pattern}`, { referencedTable: 'players' });
}

export function fetchPlayerListByIds(db, ids, signal) {
  if (ids.length > 50) throw new Error('You can load up to 50 card details at a time.');
  return cachedPlayerPage(db, JSON.stringify(['cards', ids]), async () => {
    if (!ids.length) return [];
    const { data, error } = await db.from('card_versions').select(PLAYER_LIST_SELECT)
      .in('id', ids).limit(50);
    if (error) throw error;
    const byId = new Map((data ?? []).map(row => [String(row.id), { ...row, summary_only: true }]));
    if (ids.some(id => !byId.has(String(id)))) throw new Error('Unable to load some player details. Please try again.');
    return ids.map(id => byId.get(String(id)));
  }, signal);
}
// Full detail stats are fetched only after a user selects a search result.
export function loadPlayerDetail(db, id) {
  if (!db) return Promise.reject(new Error('Supabase connection is not configured.'));
  if (!detailCaches.has(db)) detailCaches.set(db, new Map());
  const cache = detailCaches.get(db);
  const key = String(id);
  if (!cache.has(key)) {
    const loading = (async () => {
      const { data, error } = await db.from('card_versions').select(PLAYER_CARD_SELECT).eq('id', id).single();
      if (error) throw error;
      if (!data) throw new Error('Unable to load player details.');
      return data;
    })();
    cache.set(key, loading);
    loading.catch(() => cache.delete(key));
  }
  return cache.get(key);
}
