export function applyPhysicalQuery(query, acceleTypes, bodyTypes) {
  const types = [...acceleTypes];
  if (types.length === 1) {
    query = types[0] === 'Controlled' ? query.eq('accele_type', 'Controlled')
      : query.ilike('accele_type', `%${types[0]}%`);
  } else if (types.length) {
    query = query.or(types.map(type => type === 'Controlled' ? 'accele_type.eq.Controlled' : `accele_type.ilike.%${type}%`).join(','));
  }
  if (bodyTypes.size === 1) query = query.eq('body_type_group', [...bodyTypes][0]);
  else if (bodyTypes.size > 1) query = query.in('body_type_group', [...bodyTypes]);
  return query;
}
export function matchesPhysicalTypes(card, acceleTypes, bodyTypes) {
  const accelerationMatches = !acceleTypes.size || [...acceleTypes].some(type => type === 'Controlled'
    ? card.accele_type === 'Controlled' : String(card.accele_type ?? '').toLowerCase().includes(type.toLowerCase()));
  return accelerationMatches && (!bodyTypes.size || bodyTypes.has(card.body_type_group));
}

const hasPhysicalValue = value => value !== '' && value != null;
export function countPhysicalRequirements(req = {}) {
  return ['acceleTypes', 'bodyTypes'].reduce((sum, key) => sum + [...(req[key] ?? [])].length, 0)
    + ['preferredFoot', 'gender', 'minHeight', 'maxHeight', 'minWeight', 'maxWeight']
      .filter(key => hasPhysicalValue(req[key])).length;
}

// Shared by the Players page and slot-specific candidate queries, before LIMIT.
export function applyPhysicalRequirements(query, req = {}) {
  query = applyPhysicalQuery(query, new Set(req.acceleTypes ?? []), new Set(req.bodyTypes ?? []));
  for (const [column, key] of [['preferred_foot', 'preferredFoot'], ['players.gender', 'gender']]) {
    if (hasPhysicalValue(req[key])) query = query.eq(column, req[key]);
  }
  for (const [column, min, max] of [['players.height', 'minHeight', 'maxHeight'], ['players.weight', 'minWeight', 'maxWeight']]) {
    if (hasPhysicalValue(req[min])) query = query.gte(column, Number(req[min]));
    if (hasPhysicalValue(req[max])) query = query.lte(column, Number(req[max]));
  }
  return query;
}

export function matchesPhysicalRequirements(card, req = {}) {
  const unwrap = value => (Array.isArray(value) ? value[0] : value) ?? {};
  const source = card?.card ?? card ?? {};
  const raw = source.raw ?? {};
  const player = unwrap(source.players ?? raw.players ?? source.playerDef ?? source.player);
  const value = key => source[key] ?? raw[key] ?? player[key];
  if (!matchesPhysicalTypes({ accele_type: value('accele_type'), body_type_group: value('body_type_group') },
    new Set(req.acceleTypes ?? []), new Set(req.bodyTypes ?? []))) return false;
  for (const [column, key] of [['preferred_foot', 'preferredFoot'], ['gender', 'gender']]) {
    if (hasPhysicalValue(req[key]) && value(column) !== req[key]) return false;
  }
  for (const [column, min, max] of [['height', 'minHeight', 'maxHeight'], ['weight', 'minWeight', 'maxWeight']]) {
    if (!hasPhysicalValue(req[min]) && !hasPhysicalValue(req[max])) continue;
    const measured = value(column);
    if (!hasPhysicalValue(measured) || !Number.isFinite(Number(measured))) return false;
    if (hasPhysicalValue(req[min]) && Number(measured) < Number(req[min])) return false;
    if (hasPhysicalValue(req[max]) && Number(measured) > Number(req[max])) return false;
  }
  return true;
}
