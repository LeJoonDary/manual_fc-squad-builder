export function normalizeClubName(value: string): string {
  const name = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/['’]/g, '').replace(/[-_]/g, ' ').replace(/\b(women|womens|woman|ladies|femenino|femenina|femeni|frauen|wfc)\b/g, '')
    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const aliases: Record<string, string> = {
    'real madrid': 'real-madrid', 'real madrid cf': 'real-madrid',
    'barcelona': 'barcelona', 'fc barcelona': 'barcelona',
    'arsenal': 'arsenal', 'arsenal fc': 'arsenal', 'chelsea': 'chelsea', 'chelsea fc': 'chelsea',
    'man city': 'manchester-city', 'manchester city': 'manchester-city', 'manchester city fc': 'manchester-city',
    'fc bayern munchen': 'bayern', 'bayern munich': 'bayern', 'bayern munchen': 'bayern',
    'lyon': 'lyon', 'olympique lyonnais': 'lyon', 'ol lyonnes': 'lyon',
  };
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized === 'unknown club' ? '' : aliases[name] ?? normalized;
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
