import { expect, test } from 'vitest';
import { sortAffiliations, clubsForLeague } from './affiliations.js';

test('prioritizes football nations and alphabetizes the rest', () => {
  const rows = ['Zambia', 'Brazil', 'Albania', 'France'].map(name => ({ name }));
  expect(sortAffiliations(rows, 'nations').map(r => r.name)).toEqual(['France', 'Brazil', 'Albania', 'Zambia']);
});
test('distinguishes major leagues from identically named leagues', () => {
  const rows = [{ name: 'Premier League', short_name: 'RU1' }, { name: 'La Liga', short_name: 'LAL' }, { name: 'Premier League', short_name: 'EPL' }];
  expect(sortAffiliations(rows, 'leagues').map(r => r.short_name)).toEqual(['EPL', 'LAL', 'RU1']);
});
test('filters clubs by league ID and keeps all when no league is selected', () => {
  const clubs = [{ name: 'B', league_id: 13 }, { name: 'A', league_id: 53 }];
  expect(clubsForLeague(clubs, '13')).toEqual([clubs[0]]);
  expect(clubsForLeague(clubs, '')).toHaveLength(2);
  expect(sortAffiliations(clubs, 'clubs').map(r => r.name)).toEqual(['A', 'B']);
});
