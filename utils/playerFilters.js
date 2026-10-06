import { defaultStats, activeStats, applyStatQuery } from './statFilters.js';
import { applyPhysicalQuery } from './physicalFilters.js';
import { PLAYER_LIST_SELECT, cachedPlayerPage, fetchPlayerListByIds, applyPlayerNameQuery, findPlayerNameIds } from './playerCatalog.js';
import { PLAYER_PAGE_SIZE } from './playerPagination.js';
import { matchesPlayerName } from './playerSearch.js';
import { selectedPlaystyles } from './playstyleFilters.js';

export function createDefaultFilters() {
  return {
    name: '', minOvr: '', maxOvr: '', minPrice: '', maxPrice: '', minSm: null, minWf: null,
    positions: new Set(), onlyPrimary: false, hasAllPositions: false,
    selectedNormalIds: [], selectedPlusIds: [], requireAllPlaystyles: false,
    minPlaystyles: '', maxPlaystyles: '', minPlaystylesPlus: '', maxPlaystylesPlus: '',
    selectedRoles: [], hasAllRoles: false, isStrictRoleMode: false,
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
  // Soft role preferences affect auto-build scoring, not catalog eligibility.

  relations.hasAllRoles = false; // Requirements from different positions are alternatives for one card.
  relations.selectedPlayStyles = selectedPlaystyles(filters);
  let query = db.rpc('filter_player_cards', { filters: relations }, { count: 'exact' })
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
  return query.order('overall', { ascending: false, nullsFirst: false }).order('id');
}

const filterKey = filters => JSON.stringify({ ...filters, name: '' }, (_, value) => value instanceof Set ? [...value].sort() : value);

export async function fetchPlayers(db, filters, signal) {
  return (await fetchPlayersPage(db, filters, { signal })).rows;
}

export async function fetchPlayersPage(db, filters, { offset = 0, signal } = {}) {
  if (!db) throw new Error('Supabase connection is not configured.');
  filters = structuredClone(filters);
  signal?.throwIfAborted();
  const hasFilters = filterKey(filters) !== filterKey(createDefaultFilters());
  const key = ['players-page', filterKey(filters), filters.name.trim()];
  return cachedPlayerPage(db, JSON.stringify([...key, offset]), async () => {
    const playerIds = filters.name.trim() ? await findPlayerNameIds(db, filters.name) : null;
    if (playerIds?.length === 0) return { rows: [], total: 0 };
    const makeQuery = (summary = false) => hasFilters ? buildPlayerQuery(db, filters)
      : db.from('card_versions').select(summary ? 'id,players!inner(id,name,long_name)' : PLAYER_LIST_SELECT, { count: 'exact' })
        .order('overall', { ascending: false, nullsFirst: false }).order('id');

    // Broad name searches can produce regex false positives. Cache only the
    // matching IDs, so totals and offsets use the same normalized name rules.
    if (filters.name.trim() && playerIds === null) {
      const ids = await cachedPlayerPage(db, JSON.stringify([...key, 'matching-ids']), async () => {
        const matches = [];
        for (let scanned = 0; ;) {
          const { data, error, count } = await applyPlayerNameQuery(makeQuery(true), filters.name).range(scanned, scanned + 499);
          if (error) throw error;
          for (const row of data ?? []) {
            const player = Array.isArray(row.players) ? row.players[0] : row.players;
            if (matchesPlayerName(player ?? {}, filters.name)) matches.push(row.id);
          }
          scanned += data?.length ?? 0;
          if (!data?.length || (count != null ? scanned >= count : data.length < 500)) break;
        }
        return matches;
      });
      return { rows: await fetchPlayerListByIds(db, ids.slice(offset, offset + PLAYER_PAGE_SIZE)), total: ids.length };
    }
    const query = makeQuery();
    if (playerIds) query.in('player_id', playerIds);
    const { data, error, count } = await query.range(offset, offset + PLAYER_PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    return {
      rows: hasFilters ? await fetchPlayerListByIds(db, rows.map(row => row.id))
        : rows.map(row => ({ ...row, summary_only: true })),
      total: count ?? offset + rows.length,
    };
  }, signal);
}
