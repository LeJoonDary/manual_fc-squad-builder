export function normalizeClubName(value: string): string {
  const name = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/['’]/g, '').replace(/[-_]/g, ' ').replace(/\b(women|womens|woman|ladies|femenino|femenina|femeni|frauen|wfc)\b/g, '')
    .replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
  const aliases: Record<string, string> = {
    'real madrid': 'real-madrid', 'real madrid cf': 'real-madrid',
    'barcelona': 'barcelona', 'fc barcelona': 'barcelona',
    'arsenal': 'arsenal', 'arsenal fc': 'arsenal', 'chelsea': 'chelsea', 'chelsea fc': 'chelsea',
    'man city': 'manchester-city', 'manchester city': 'manchester-city', 'manchester city fc': 'manchester-city',
    'fc bayern munchen': 'bayern', 'bayern munich': 'bayern', 'bayern munchen': 'bayern',
    'lyon': 'lyon', 'olympique lyonnais': 'lyon', 'ol lyonnes': 'lyon',
    'as roma': 'roma', 'roma': 'roma', 'roma femminile': 'roma',
    'deportivo alaves': 'alaves', 'alaves': 'alaves', 'alaves gloriosas': 'alaves',
    'manchester united': 'manchester utd', 'manchester united fc': 'manchester utd',
    'man utd': 'manchester utd', 'manchester utd': 'manchester utd',
  };
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized === 'unknown club' ? '' : aliases[name] ?? name;
}

/** Club names pool men's and women's teams across database IDs. IDs are a fallback only. */
export function sharedClubKey(card: any): string {
  for (const source of [card, card?.card, card?.raw].filter(Boolean)) {
    const club = Array.isArray(source.clubs) ? source.clubs[0] : source.clubs;
    const singular = Array.isArray(source.club) ? source.club[0] : source.club;
    for (const value of [singular?.name, source.club_name, source.clubName,
      typeof source.club === 'string' ? source.club : null, club?.name, source.team]) {
      if (typeof value !== 'string') continue;
      const name = normalizeClubName(value);
      if (name) return `club:shared:${name}`;
    }
  }
  return '';
}

/** Shared name identity, with an ID fallback when no usable name is available. */
export function getSharedClubKey(card: any): string {
  const named = sharedClubKey(card);
  if (named) return named;
  for (const source of [card, card?.card, card?.raw].filter(Boolean)) {
    const club = Array.isArray(source.clubs) ? source.clubs[0] : source.clubs;
    const singular = Array.isArray(source.club) ? source.club[0] : source.club;
    const id = source.clubId ?? source.club_id ?? singular?.id ?? club?.id;
    if (id != null && id !== '') return String(id);
  }
  return '';
}
