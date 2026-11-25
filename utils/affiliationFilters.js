export function applyAffiliationQuery(query, affiliation = {}) {
  for (const [key, column] of [['leagueId', 'league_id'], ['clubId', 'club_id'], ['nationId', 'players.nation_id']]) {
    if (affiliation[key] !== '' && affiliation[key] != null) query = query.eq(column, affiliation[key]);
  }
  return query;
}
export function matchesAffiliation(card, affiliation = {}) {
  const source = card?.card ?? card ?? {};
  const raw = source.raw ?? {};
  const relation = source.players ?? raw.players;
  const player = (Array.isArray(relation) ? relation[0] : relation) ?? {};
  const actual = { leagueId: source.league_id ?? raw.league_id, clubId: source.club_id ?? raw.club_id,
    nationId: source.nation_id ?? raw.nation_id ?? player.nation_id };
  return Object.entries(affiliation).every(([key, id]) => id === '' || id == null || String(actual[key]) === String(id));
}
