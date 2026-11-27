export function getPlayerId(card) {
  for (const value of [card?.player_id, card?.raw?.player_id]) {
    if (value != null && String(value).trim() !== '') return String(value).trim();
  }
  for (const source of [card, card?.raw]) {
    const player = Array.isArray(source?.players) ? source.players[0] : source?.players;
    for (const value of [source?.player_id, source?.playerId, source?.player?.id, player?.id]) {
      if (value != null && String(value).trim() !== '') return String(value).trim();
    }
  }
  return null;
}

export function getCardVersionKey(card) {
  const id = card?.card_id ?? card?.id ?? card?.raw?.card_id ?? card?.raw?.id;
  return id == null ? null : String(id);
}
export function getPlayerUniqueKey(card) {
  return getPlayerId(card) ?? (getCardVersionKey(card) === null ? null : `card:${getCardVersionKey(card)}`);
}
export function isSamePlayer(a, b) {
  const left = getPlayerId(a), right = getPlayerId(b);
  if (left !== null && right !== null) return left === right;
  const id = getCardVersionKey(a);
  return id !== null && id === getCardVersionKey(b);
}
export function hasDuplicatePitchPlayer(squad, targetPosition, card, movingFrom = null) {
  return Object.entries(squad).some(([position, entry]) => position !== targetPosition && position !== movingFrom
    && entry?.card && isSamePlayer({ card_id: entry.card_id, ...entry.card }, card));
}
