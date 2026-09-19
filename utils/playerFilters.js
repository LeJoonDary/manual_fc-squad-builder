import { defaultStats, activeStats, applyStatQuery } from './statFilters.js';
import { applyPhysicalQuery } from './physicalFilters.js';
import { PLAYER_CARD_SELECT } from './playerCards.js';
import { fetchPlayerPage } from './playerPagination.js';

export function createDefaultFilters() {
  return {
    name: '', minOvr: '', maxOvr: '', minPrice: '', maxPrice: '', minSm: null, minWf: null,
    positions: new Set(), onlyPrimary: false, hasAllPositions: false,
    selectedPlayStyles: [], requireAllPlaystyles: false,
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
  relations.name = relations.name.trim();
  let query = db.rpc('filter_player_cards', { filters: relations })
    .select(`*, players!inner(id)${activeStats(filters.stats).length ? ', player_stats!inner(card_id)' : ''}`);
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

export async function fetchPlayers(db, filters, signal) {
  if (!db) throw new Error('Supabase 연결 정보가 없습니다.');
  const query = buildPlayerQuery(db, filters).abortSignal(signal);
  return fetchPlayerPage(query, 0, ids => db.from('card_versions')
    .select(PLAYER_CARD_SELECT).in('id', ids).limit(50).abortSignal(signal));
}
