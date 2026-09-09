const normalizeText = value => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/ø/g, 'o').replace(/Ø/g, 'O')
  .replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
  .replace(/ß/g, 'ss').toLowerCase();

// Cards carry players.name and players.long_name from the database join.
export function matchesPlayerName(card, query) {
  const term = normalizeText(query).trim();
  return !term || [card.name, card.long_name]
    .some(value => normalizeText(value).includes(term));
}
