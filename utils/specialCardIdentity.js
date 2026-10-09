const sources = card => [card, card?.card, card?.raw, card?.card?.raw].filter(Boolean);
const idMatches = (value, id) => value != null && (String(value) === String(id) || String(value).endsWith(`:id:${id}`));
export function isCardIcon(card) {
  return sources(card).some(c => c.isIcon || c.is_icon
    || [c.league_id, c.leagueId, c.league?.id].some(id => idMatches(id, 2118))
    || [c.club_id, c.clubId, c.club?.id].some(id => idMatches(id, 112658))
    || /icon/i.test(String(c.version ?? '')) || /icon/i.test(String(c.card_type ?? c.cardType ?? '')));
}
export function isCardHero(card) {
  return !isCardIcon(card) && sources(card).some(c => c.isHero || c.is_hero
    || /hero/i.test(String(c.version ?? '')) || /hero/i.test(String(c.card_type ?? c.cardType ?? '')));
}
