/** Restore DB IDs from chemistry keys before the UI adapts the manager again. */
export function autoBuildManagerState(manager, catalog, cards) {
  if (!manager) return null;
  const affiliation = (kind, key, records) => {
    if (key == null || key === '') return { id: null, name: '미지정' };
    const text = String(key);
    const idPrefix = `${kind}:id:`;
    const namePrefix = `${kind}:name:`;
    if (text.startsWith(namePrefix)) return { id: undefined, name: text.slice(namePrefix.length) };
    const id = text.startsWith(idPrefix) ? text.slice(idPrefix.length) : text;
    const record = records.find(row => String(row.id) === id);
    const card = cards.find(row => String(row[`${kind}_id`]) === id);
    return { id, name: record?.name ?? card?.[kind] ?? id };
  };
  const league = affiliation('league', manager.bestLeagueId, catalog.leagues);
  const nation = affiliation('nation', manager.bestNationId, catalog.nations);
  return { name: 'Smart Manager', leagueId: league.id, nationId: nation.id, league: league.name, nation: nation.name };
}
