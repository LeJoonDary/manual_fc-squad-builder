import { calculate_base_score } from './metaScore.js';

const SCORE_POSITIONS = new Set(['ST', 'CF', 'LW', 'RW', 'CM', 'CAM', 'CDM', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'LM', 'RM']);

// The modal evaluates every candidate at the clicked slot, not its primary position.
export function scoreModalPlayers(cards, targetPosition) {
  return cards.map(card => ({
    ...card,
    ...(SCORE_POSITIONS.has(targetPosition)
      ? calculate_base_score(card, card, targetPosition, false)
      : { meta_score: null, value_score: 0 }),
    score_position: targetPosition,
  })).sort((a, b) => (b.meta_score ?? 0) - (a.meta_score ?? 0));
}

// Normalized search cards carry the six stats, wf, sm and price directly.
export function scoreSearchResults(cards, selectedPositions = [], onlyPrimary = false) {
  const scored = cards.map(card => {
    const available = [card.primary_position, ...(onlyPrimary ? [] : card.secondary_positions ?? [])];
    const positions = selectedPositions.length
      ? selectedPositions.filter(position => available.includes(position))
      : [card.primary_position];
    const scores = positions.filter(position => SCORE_POSITIONS.has(position))
      .map(position => ({ ...calculate_base_score(card, card, position, false), score_position: position }));
    scores.sort((a, b) => b.meta_score - a.meta_score);
    return { ...card, ...(scores[0] ?? { meta_score: null, value_score: 0, score_position: null }) };
  });
  return scored.sort(selectedPositions.length
    ? (a, b) => (b.meta_score ?? -Infinity) - (a.meta_score ?? -Infinity)
    : (a, b) => Number(b.overall ?? 0) - Number(a.overall ?? 0));
}

export function getValueScoreGrade(value) {
  if (value >= 0.001) return '가성비 좋음';
  if (value >= 0.0001) return '가성비 보통';
  return '가성비 좋지 않음';
}

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
