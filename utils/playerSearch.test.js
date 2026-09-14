import { expect, test } from 'vitest';
import { matchesPlayerName, scoreSearchResults, scoreModalPlayers, getValueScoreGrade } from './playerSearch.js';

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

test('modal uses four-back LM weights and handles absent prices and unsupported GK', () => {
  expect(scoreModalPlayers([{ ...attacker, price: null }], 'LM')[0])
    .toMatchObject({ meta_score: 81.5, value_score: 0 });
  expect(scoreModalPlayers([attacker], 'GK')[0])
    .toMatchObject({ meta_score: null, value_score: 0 });
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

test('unsupported GK stays visible without a fabricated score and missing price yields zero', () => {
  const result = scoreSearchResults([{ primary_position: 'GK' }, { ...attacker, price: null }], ['GK', 'ST']);
  expect(result[0].value_score).toBe(0);
  expect(result[1]).toMatchObject({ meta_score: null, value_score: 0 });
});

test.each([
  [0.12, '가성비 좋음'], [0.001, '가성비 좋음'],
  [0.0009999, '가성비 보통'], [0.0001, '가성비 보통'],
  [0.00009999, '가성비 좋지 않음'], [3.48e-5, '가성비 좋지 않음'],
  [0, '가성비 좋지 않음'],
])('value score %s displays grade %s', (value, grade) => {
  expect(getValueScoreGrade(value)).toBe(grade);
});
test('matches either database name, ignoring case, accents and outer whitespace', () => {
  for (const query of ['K. Mbappé', 'Kylian Mbappé', ' KYLIAN ', 'mbappe']) {
    expect(matchesPlayerName(card, query)).toBe(true);
  }
  expect(matchesPlayerName(card, 'Bellingham')).toBe(false);
});

test('handles empty names and does not consult the obsolete short_name field', () => {
  expect(matchesPlayerName({ name: null, long_name: 'Kylian' }, 'kylian')).toBe(true);
  expect(matchesPlayerName({ short_name: 'Kylian' }, 'kylian')).toBe(false);
  expect(matchesPlayerName({}, '')).toBe(true);
});
