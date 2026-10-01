// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { sortAffiliations, clubsForLeague, renderSearchableSelect } from './affiliations.js';

test('prioritizes football nations and alphabetizes the rest', () => {
  const rows = ['Zambia', 'Brazil', 'Albania', 'France'].map(name => ({ name }));
  expect(sortAffiliations(rows, 'nations').map(r => r.name)).toEqual(['France', 'Brazil', 'Albania', 'Zambia']);
});
test('distinguishes major leagues from identically named leagues', () => {
  const rows = [{ id: 99, name: 'Premier League', short_name: 'RU1' }, { id: 2, name: 'La Liga', short_name: 'LAL' }, { id: 3, name: 'Premier League', short_name: 'EPL' }];
  expect(sortAffiliations(rows, 'leagues').map(r => r.short_name)).toEqual(['EPL', 'LAL', 'RU1']);
});

test('pins all eight IDs once with a divider and searches all leagues alphabetically', () => {
  const rows = [
    { id: '8', name: 'NWSL' }, { id: 1, name: 'Barclays WSL' },
    { id: 6, name: 'Liga F Moeve' }, { id: 5, name: "Ligue 1 McDonald's" },
    { id: 12, name: 'Serie A Enilive' }, { id: 4, name: 'Bundesliga' },
    { id: 2, name: 'LALIGA EA SPORTS' }, { id: 3, name: 'Premier League' },
    { id: 99, name: 'Z League' }, { id: 98, name: 'A League' },
  ];
  expect(sortAffiliations(rows, 'leagues').map(row => Number(row.id))).toEqual([3, 2, 4, 12, 5, 6, 1, 8, 98, 99]);
  document.body.innerHTML = '<select id="league-filter"><option value="">전체 리그</option></select>';
  const select = document.querySelector('select');
  rows.forEach(row => select.add(new Option(row.name, row.id)));
  renderSearchableSelect(select, rows);
  const list = document.querySelector('.nation-options');
  expect([...list.querySelectorAll('button')].map(b => b.textContent)).toEqual([
    '전체 리그', 'Premier League', 'LALIGA EA SPORTS', 'Bundesliga', 'Serie A Enilive',
    "Ligue 1 McDonald's", 'Liga F Moeve', 'Barclays WSL', 'NWSL', 'A League', 'Z League',
  ]);
  expect(list.querySelectorAll('hr')).toHaveLength(1);
  expect(list.querySelector('hr').previousElementSibling.textContent).toBe('NWSL');
  const input = document.querySelector('input');
  input.value = 'league';
  input.dispatchEvent(new Event('input'));
  expect([...list.querySelectorAll('button')].map(b => b.textContent)).toEqual(['전체 리그', 'A League', 'Premier League', 'Z League']);
  expect(list.querySelector('hr')).toBeNull();
  list.querySelectorAll('button')[2].click();
  expect(select.value).toBe('3');
});
test('filters clubs by league ID and keeps all when no league is selected', () => {
  const clubs = [{ name: 'B', league_id: 13 }, { name: 'A', league_id: 53 }];
  expect(clubsForLeague(clubs, '13')).toEqual([clubs[0]]);
  expect(clubsForLeague(clubs, '')).toHaveLength(2);
  expect(sortAffiliations(clubs, 'clubs').map(r => r.name)).toEqual(['A', 'B']);
});
