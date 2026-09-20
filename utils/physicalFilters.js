export function applyPhysicalQuery(query, acceleTypes, bodyTypes) {
  const types = [...acceleTypes];
  if (types.length === 1) {
    query = types[0] === 'Controlled' ? query.eq('accele_type', 'Controlled')
      : query.ilike('accele_type', `%${types[0]}%`);
  } else if (types.length) {
    query = query.or(types.map(type => type === 'Controlled' ? 'accele_type.eq.Controlled' : `accele_type.ilike.%${type}%`).join(','));
  }
  if (bodyTypes.size === 1) query = query.eq('body_type', [...bodyTypes][0]);
  else if (bodyTypes.size > 1) query = query.in('body_type', [...bodyTypes]);
  return query;
}
export function matchesPhysicalTypes(card, acceleTypes, bodyTypes) {
  const accelerationMatches = !acceleTypes.size || [...acceleTypes].some(type => type === 'Controlled'
    ? card.accele_type === 'Controlled' : String(card.accele_type ?? '').toLowerCase().includes(type.toLowerCase()));
  return accelerationMatches && (!bodyTypes.size || bodyTypes.has(card.body_type));
}
