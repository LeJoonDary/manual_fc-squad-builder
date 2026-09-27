export function formatCardVersion(version) {
  const value = String(version ?? '').trim().replace(/^special_/i, '');
  if (!value) return 'Standard';
  return value.replace(/_/g, ' ').split(/\s+/).map(word => {
    if (['totw', 'icon'].includes(word.toLowerCase())) return word.toUpperCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

const unwrap = value => Array.isArray(value) ? value[0] : value;
const text = value => typeof value === 'string' ? value.trim() : '';
const abbreviations = {
  'la liga': 'LALIGA', 'laliga': 'LALIGA', 'laliga ea sports': 'LALIGA',
  'premier league': 'EPL', 'bundesliga': 'BUN', 'serie a': 'SA', 'ligue 1': 'L1',
  'real madrid': 'RMA', 'real madrid cf': 'RMA', 'fc barcelona': 'FCB',
  'barcelona': 'FCB', 'fc bayern münchen': 'FCB', 'bayern munich': 'FCB',
};

export function pitchAffiliation(card, key, catalog = {}) {
  const relation = unwrap(card[`${key}s`] ?? card.raw?.[`${key}s`])
    ?? (typeof card[key] === 'object' ? card[key] : {});
  const id = card[`${key}_id`] ?? relation?.id;
  const entity = catalog[`${key}s`]?.find(row => String(row.id) === String(id));
  const name = text(card[key]) || text(relation?.name) || text(entity?.name);
  const club = unwrap(card.clubs ?? card.raw?.clubs) ?? card.club;
  const isIcon = /icon/i.test(name) || String(card.club_id ?? club?.id) === '112658';
  if (isIcon) return { name: 'ICON', label: 'ICON', isIcon: true };
  const short = text(card[`${key}_short_name`]) || text(relation?.short_name) || text(entity?.short_name);
  const fallback = abbreviations[name.toLowerCase()] || (name.split(/\s+/).length > 1
    ? name.split(/\s+/).map(word => word[0]).join('').slice(0, 6).toUpperCase()
    : name.slice(0, 6).toUpperCase());
  return { name, label: short || fallback, isIcon: false };
}
