import { defaultStats, activeStats, applyStatQuery } from './statFilters.js';
import { applyPhysicalQuery } from './physicalFilters.js';
import { fetchPlayerListPage, cachedPlayerPage, fetchPlayerListByIds, applyPlayerNameQuery, findPlayerNameIds } from './playerCatalog.js';
import { matchesPlayerName } from './playerSearch.js';
import { selectedPlaystyles } from './playstyleFilters.js';

export function createDefaultFilters() {
  return {
    name: '', minOvr: '', maxOvr: '', minPrice: '', maxPrice: '', minSm: null, minWf: null,
    positions: new Set(), onlyPrimary: false, hasAllPositions: false,
    selectedNormalIds: [], selectedPlusIds: [], requireAllPlaystyles: false,
    minPlaystyles: '', maxPlaystyles: '', minPlaystylesPlus: '', maxPlaystylesPlus: '',
    selectedRoles: [], hasAllRoles: false,
    acceleTypes: new Set(), preferredFoot: '', gender: '', bodyTypes: new Set(),
    minHeight: '', maxHeight: '', minWeight: '', maxWeight: '', minAge: '', maxAge: '',
    nation: '', league: '', club: '', rarities: new Set(), stats: defaultStats(),
  };
}

export function buildPlayerQuery(db, filters) {
  // JSON snapshot also prevents mutable UI state from changing an in-flight query.
  const relations = JSON.parse(JSON.stringify(filters, (_, value) => value instanceof Set ? [...value] : value));
  // Name matching happens in playerSearch.js, before the visible result limit.
  relations.name = '';
  relations.selectedPlayStyles = selectedPlaystyles(filters);
  let query = db.rpc('filter_player_cards', { filters: relations })
    .select(`*, players!inner(id,name,long_name)${activeStats(filters.stats).length ? ', player_stats!inner(card_id)' : ''}`);
  const hasValue = value => value !== '' && value != null;
  for (const [column, minimum, maximum] of [
    ['overall', filters.minOvr, filters.maxOvr], ['price', filters.minPrice, filters.maxPrice],
    ['players.height', filters.minHeight, filters.maxHeight],
    ['players.weight', filters.minWeight, filters.maxWeight],
    ['players.age', filters.minAge, filters.maxAge],
  ]) {
    if (hasValue(minimum)) query = query.gte(column, Number(minimum));
    if (hasValue(maximum)) query = query.lte(column, Number(maximum));
  }
  if (hasValue(filters.minSm)) query = query.gte('sm', filters.minSm);
  if (hasValue(filters.minWf)) query = query.gte('wf', filters.minWf);
  for (const [column, value] of [
    ['players.nation_id', filters.nation], ['league_id', filters.league], ['club_id', filters.club],
    ['players.gender', filters.gender], ['preferred_foot', filters.preferredFoot],
  ]) if (hasValue(value)) query = query.eq(column, value);
  query = applyStatQuery(query, filters.stats);
  query = applyPhysicalQuery(query, filters.acceleTypes, filters.bodyTypes);
  // The actual schema calls overall_rating "overall".
  return query.order('overall', { ascending: false, nullsFirst: false }).order('id').limit(50);
}

const filterKey = filters => JSON.stringify({ ...filters, name: '' }, (_, value) => value instanceof Set ? [...value].sort() : value);

export async function fetchPlayers(db, filters, signal) {
  if (!db) throw new Error('Supabase 연결 정보가 없습니다.');
  filters = structuredClone(filters);
  signal?.throwIfAborted();
  const hasFilters = filterKey(filters) !== filterKey(createDefaultFilters());
  if (!hasFilters) return fetchPlayerListPage(db, { keyword: filters.name, signal });
  return cachedPlayerPage(db, JSON.stringify(['filters', filterKey(filters), filters.name.trim()]), async () => {
    const rows = [];
    const playerIds = filters.name.trim() ? await findPlayerNameIds(db, filters.name) : null;
    if (playerIds?.length === 0) return [];
    for (let offset = 0; rows.length < 50;) {
      // The existing RPC filters candidates. Retrieve display stats from the
      // actual table afterward; embedding them in the RPC fails in PostgREST.
      const base = buildPlayerQuery(db, filters);
      const query = playerIds ? base.in('player_id', playerIds) : applyPlayerNameQuery(base, filters.name);
      const { data, error } = await query.range(offset, offset + 49).limit(50);
      if (error) throw error;
      for (const row of data ?? []) {
        const player = Array.isArray(row.players) ? row.players[0] : row.players;
        if (matchesPlayerName(player ?? {}, filters.name)) rows.push({ ...row, summary_only: true });
      }
      if (!data?.length || data.length < 50) break;
      offset += data.length;
    }
    return fetchPlayerListByIds(db, rows.slice(0, 50).map(row => row.id));
  }, signal);
}
