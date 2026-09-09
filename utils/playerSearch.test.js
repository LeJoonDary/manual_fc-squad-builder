import { expect, test } from 'vitest';
import { matchesPlayerName } from './playerSearch.js';

const card = { name: 'K. Mbappé', long_name: 'Kylian Mbappé' };
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
