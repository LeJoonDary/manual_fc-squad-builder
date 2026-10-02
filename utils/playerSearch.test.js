import { expect, test, vi } from 'vitest';
import { matchesPlayerName, preparePlayerSearch, createPlayerNameMatcher, playerNamePattern, scoreSearchResults, scoreModalPlayers, getValueScoreGrade } from './playerSearch.js';

const card = { name: 'K. Mbappé', long_name: 'Kylian Mbappé' };
const attacker = { id: 1, primary_position: 'CM', secondary_positions: ['ST', 'LM'], overall: 70, pac: 90, sho: 80, pas: 70, dri: 60, def: 50, phy: 40, wf: 5, sm: 4, price: 100 };

test('modal uses the clicked slot and changes ranking when the slot changes', () => {
  const midfielder = { ...attacker, id: 2, overall: 99, sho: 20, pas: 99, def: 99 };
  const cards = [midfielder, attacker];
  const forwards = scoreModalPlayers(cards, 'ST');
  expect(forwards.map(card => card.id)).toEqual([1, 2]);
  expect(forwards[0]).toMatchObject({ meta_score: 81.5, value_score: 0.815, score_position: 'ST' });
  expect(scoreModalPlayers(cards, 'CM').map(card => card.id)).toEqual([2, 1]);
  expect(cards[0]).toBe(midfielder);
  expect(attacker.meta_score).toBeUndefined();
  expect(forwards.filter(card => matchesPlayerName({ ...card, name: 'Player' }, 'player')).map(card => card.id)).toEqual([1, 2]);
});

test('modal uses four-back LM weights and safe defaults for missing GK stats', () => {
  expect(scoreModalPlayers([{ ...attacker, price: null }], 'LM')[0])
    .toMatchObject({ meta_score: 81.5, value_score: 0 });
  expect(scoreModalPlayers([attacker], 'GK')[0])
    .toMatchObject({ meta_score: 0, value_score: 0 });
});

test('selected position ranks by meta score rather than overall, without mutating cards', () => {
  const cards = [{ ...attacker, id: 2, overall: 99, sho: 10 }, attacker];
  const result = scoreSearchResults(cards, ['ST']);
  expect(result.map(card => card.id)).toEqual([1, 2]);
  expect(result[0]).toMatchObject({ meta_score: 81.5, value_score: 0.815, score_position: 'ST' });
  expect(cards[0].id).toBe(2);
  expect(attacker.meta_score).toBeUndefined();
});

test('no position filter scores the primary position and retains overall ordering', () => {
  const result = scoreSearchResults([attacker, { ...attacker, id: 2, overall: 99 }]);
  expect(result.map(card => card.id)).toEqual([2, 1]);
  expect(result[0]).toMatchObject({ meta_score: 72.5, score_position: 'CM' });
});

test('multiple positions use the best eligible score and honor primary-only filtering', () => {
  expect(scoreSearchResults([attacker], ['CM', 'ST'])[0].score_position).toBe('ST');
  expect(scoreSearchResults([attacker], ['CM', 'ST'], true)[0].score_position).toBe('CM');
  expect(scoreSearchResults([attacker], ['LM'])[0].meta_score).toBe(81.5);
});

test('GK uses zero for missing stats and missing price yields zero', () => {
  const result = scoreSearchResults([{ primary_position: 'GK' }, { ...attacker, price: null }], ['GK', 'ST']);
  expect(result[0].value_score).toBe(0);
  expect(result[1]).toMatchObject({ meta_score: 0, value_score: 0 });
});

test('GK receives the same numeric score in search results and the selection modal', () => {
  const keeper = {id: 2, primary_position: 'GK', height: 195, playstyles: [{name:'Deflector'}],
    gk_reflexes: 80, gk_diving: 80, gk_positioning: 80, gk_handling: 80, reactions: 80};
  expect(scoreSearchResults([keeper])[0]).toMatchObject({meta_score: 82.5, score_position: 'GK'});
  expect(scoreModalPlayers([keeper], 'GK')[0]).toMatchObject({meta_score: 82.5, score_position: 'GK'});
});

test.each([
  [0.12, 'Good Value'], [0.001, 'Good Value'],
  [0.0009999, 'Average Value'], [0.0001, 'Average Value'],
  [0.00009999, 'Poor Value'], [3.48e-5, 'Poor Value'],
  [0, 'Poor Value'],
])('value score %s displays grade %s', (value, grade) => {
  expect(getValueScoreGrade(value)).toBe(grade);
});
test('matches either database name, ignoring case, accents and outer whitespace', () => {
  for (const query of ['K. Mbappé', 'Kylian Mbappé', ' KYLIAN ', 'mbappe']) {
    expect(matchesPlayerName(card, query)).toBe(true);
  }
  expect(matchesPlayerName(card, 'Bellingham')).toBe(false);
});

test('matches sharp s as ss regardless of case', () => {
  const player = { name: 'Pascal Groß', long_name: 'Pascal Groß' };
  for (const query of ['gross', 'GROSS', 'Groß', 'pascal gross']) {
    expect(matchesPlayerName(player, query)).toBe(true);
  }
});

test('handles empty names and does not consult the obsolete short_name field', () => {
  expect(matchesPlayerName({ name: null, long_name: 'Kylian' }, 'kylian')).toBe(true);
  expect(matchesPlayerName({ short_name: 'Kylian' }, 'kylian')).toBe(false);
  expect(matchesPlayerName({}, '')).toBe(true);
});

test('precomputes names once and reuses them across searches and refreshed objects', () => {
  const player = { name: 'Cache Groß', long_name: 'Cache Kylian Mbappé' };
  const normalize = vi.spyOn(String.prototype, 'normalize');
  try {
    preparePlayerSearch(player);
    expect(player.normalized_name).toBe('cache gross');
    expect(player.normalized_long_name).toBe('cache kylian mbappe');
    expect(normalize).toHaveBeenCalledTimes(2);
    preparePlayerSearch(player);
    const refreshed = preparePlayerSearch({ name: player.name, long_name: player.long_name });
    expect(normalize).toHaveBeenCalledTimes(2);
    const matcher = createPlayerNameMatcher(' MBAPPE ');
    for (let i = 0; i < 1000; i++) expect(matcher(refreshed)).toBe(true);
    expect(normalize).toHaveBeenCalledTimes(3);
    player.name = 'Cache Ødegaard';
    preparePlayerSearch(player);
    expect(player.normalized_name).toBe('cache odegaard');
    expect(normalize).toHaveBeenCalledTimes(4);
  } finally {
    normalize.mockRestore();
  }
});

test.each([
  ['gross', 'Groß'], ['GROSS', 'GROẞ'], ['mbappe', 'Mbappé'],
  ['mbappe', 'Mbappe\u0301'], ['odegaard', 'Ødegaard'], ['aegir', 'Ægir'],
  ['s', 'ß'], ['e', 'Æ'], ['A,%_(B)"', 'A,%_(B)"'], ['홍', '홍길동'],
])('name prefilter preserves normalized match %s → %s', (query, name) => {
  expect(matchesPlayerName({ name }, query)).toBe(true);
  expect(new RegExp(playerNamePattern(query), 'iu').test(name)).toBe(true);
});
