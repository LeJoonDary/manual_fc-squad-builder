import { calculate_base_score } from './metaScore.js';

const SCORE_POSITIONS = new Set(['ST', 'CF', 'LW', 'RW', 'CM', 'CAM', 'CDM', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'LM', 'RM', 'GK']);

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
  if (value >= 0.001) return 'Good Value';
  if (value >= 0.0001) return 'Average Value';
  return 'Poor Value';
}

export const normalizeText = value => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/ø/g, 'o').replace(/Ø/g, 'O')
  .replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
  .replace(/[ßẞ]/g, 'ss').toLowerCase();

// A broad PostgREST regex narrows candidates without schema/RPC changes.
// The existing JS matcher remains the final authority (including ligatures).
const nameVariants = new Map();
for (const [start, end] of [[0x61, 0x7a], [0xc0, 0x24f], [0x1e00, 0x1eff]]) {
  for (let code = start; code <= end; code++) {
    const glyph = String.fromCodePoint(code).toLowerCase();
    const normalized = normalizeText(glyph);
    if (!/^[a-z]{1,2}$/.test(normalized)) continue;
    for (const key of new Set([normalized, ...normalized])) {
      if (!nameVariants.has(key)) nameVariants.set(key, new Set());
      nameVariants.get(key).add(glyph);
    }
  }
}
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function playerNamePattern(query) {
  const term = normalizeText(query).trim().normalize('NFC');
  const marks = '[\u0300-\u036f]*';
  const letter = char => nameVariants.has(char)
    ? `[${[...nameVariants.get(char)].join('')}]` : escapeRegex(char);
  return (term.match(/ss|ae|[\s\S]/gu) ?? []).map(token => {
    if (token.length === 2 && nameVariants.has(token)) {
      return `(${letter(token[0])}${marks}${letter(token[1])}|[${[...nameVariants.get(token)].join('')}])${marks}`;
    }
    return `${letter(token)}${marks}`;
  }).join('');
}

// Reuse names across card versions and repeated database responses as well as
// repeated searches on the same object. Changed source names get a new entry.
const normalizedNames = new Map();
const preparedPlayers = new WeakMap();
function cachedName(value) {
  const source = String(value ?? '');
  if (!normalizedNames.has(source)) normalizedNames.set(source, normalizeText(source));
  return normalizedNames.get(source);
}

export function preparePlayerSearch(player) {
  const previous = preparedPlayers.get(player);
  if (!previous || previous.name !== player.name || previous.long_name !== player.long_name) {
    player.normalized_name = cachedName(player.name);
    player.normalized_long_name = cachedName(player.long_name);
    preparedPlayers.set(player, { name: player.name, long_name: player.long_name });
  }
  return player;
}

// Create once per input, outside the candidate loop.
export function createPlayerNameMatcher(query) {
  const term = normalizeText(query).trim();
  return player => !term || player.normalized_name.includes(term)
    || player.normalized_long_name.includes(term);
}

// Cards carry players.name and players.long_name from the database join.
export function matchesPlayerName(card, query) {
  return createPlayerNameMatcher(query)(preparePlayerSearch(card));
}

// Scan ordered candidates before applying the visible page limit. A server may
// cap a response below our batch size, so only an empty batch marks the end.
export async function fetchNameFilteredPage(createQuery, keyword, offset, pageSize, signal) {
  const matches = [];
  const matchesName = createPlayerNameMatcher(keyword);
  for (let scanned = 0; matches.length < offset + pageSize;) {
    signal?.throwIfAborted();
    const { data, error } = await createQuery().limit(500)
      .range(scanned, scanned + 499).abortSignal(signal);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      const player = Array.isArray(row.players) ? row.players[0] : row.players;
      if (matchesName(preparePlayerSearch(player ?? {}))) matches.push(row);
      if (matches.length === offset + pageSize) break;
    }
    scanned += data.length;
  }
  return matches.slice(offset, offset + pageSize);
}
