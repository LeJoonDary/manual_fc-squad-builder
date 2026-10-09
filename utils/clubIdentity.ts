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
  return aliases[name] ?? '';
}

/** Only recognized shared clubs override IDs; unrelated/unknown clubs retain their IDs. */
export function sharedClubKey(card: any): string {
  for (const source of [card, card?.card, card?.raw].filter(Boolean)) {
    const club = Array.isArray(source.clubs) ? source.clubs[0] : source.clubs;
    for (const value of [source.club?.name, source.club?.slug, source.club_name, source.clubName,
      typeof source.club === 'string' ? source.club : null, club?.name, club?.slug, source.club_slug]) {
      if (typeof value !== 'string') continue;
      const name = normalizeClubName(value);
      if (name) return `club:shared:${name}`;
    }
  }
  return '';
}
