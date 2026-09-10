export const BODY_TYPE_VALUES = {
  'Lean Short': 'Lean Short', 'Lean Medium': 'Lean', 'Lean Tall': 'Lean Tall',
  'Average Short': 'Average Short', 'Average Medium': 'Average', 'Average Tall': 'Average Tall',
  'Stocky Short': 'Stocky Short', 'Stocky Medium': 'Stocky', 'Stocky Tall': 'Stocky Tall', Unique: 'Unique',
};
export function applyPhysicalQuery(query, acceleTypes, bodyTypes) {
  const types = [...acceleTypes];
  if (types.length === 1) {
    query = types[0] === 'Controlled' ? query.eq('accele_type', 'Controlled')
      : query.ilike('accele_type', `%${types[0]}%`);
  } else if (types.length) {
    query = query.or(types.map(type => type === 'Controlled' ? 'accele_type.eq.Controlled' : `accele_type.ilike.%${type}%`).join(','));
  }
  if (bodyTypes.size) query = query.in('body_type', [...bodyTypes].map(type => BODY_TYPE_VALUES[type]));
  return query;
}
export function matchesPhysicalTypes(card, acceleTypes, bodyTypes) {
  const accelerationMatches = !acceleTypes.size || [...acceleTypes].some(type => type === 'Controlled'
    ? card.accele_type === 'Controlled' : String(card.accele_type ?? '').toLowerCase().includes(type.toLowerCase()));
  return accelerationMatches && (!bodyTypes.size || [...bodyTypes].some(type => BODY_TYPE_VALUES[type] === card.body_type));
}
