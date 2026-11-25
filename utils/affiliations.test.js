// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { sortAffiliations, clubsForLeague, renderSearchableSelect, isWomenLeague } from './affiliations.js';

test.each(['Real Madrid', 'FC Barcelona', 'Arsenal', 'Manchester City'])('disambiguates %s with league labels and filters exact IDs', name => {
  const leagues = [{ id: 2, name: 'LALIGA EA SPORTS' }, { id: 6, name: 'Liga F Moeve' }];
  const clubs = [{ id: 100, name, league_id: 2 }, { id: 200, name, league_id: 6 }];
  document.body.innerHTML = '<select id="club-filter"><option value="">All Clubs</option></select>';
  const select = document.querySelector('select');
  clubs.forEach(row => select.add(new Option(row.name, String(row.id))));
  renderSearchableSelect(select, clubs, { leagues });
  const input = document.querySelector('input'); input.value = name; input.dispatchEvent(new Event('input'));
  expect(document.querySelector('[data-affiliation-id="100"]').textContent).toBe(name + 'LALIGA EA SPORTS');
  expect(document.querySelector('[data-affiliation-id="100"] .women-league-badge')).toBeNull();
  expect(document.querySelector('[data-affiliation-id="200"] .women-league-badge').textContent).toBe('W');
  document.querySelector('[data-affiliation-id="200"]').click(); expect(select.value).toBe('200');
  expect(clubs.every(club => club.name === name)).toBe(true);
});
test('women leagues recognize every specified ID and case-insensitive fallback keywords', () => {
  for (const id of [1, 6, 8, 9, 10, 15, 16, 31, 38, 44, 49, 53, 2215, 2216, 2218, 2221, 2222]) expect(isWomenLeague(id)).toBe(true);
  for (const name of ['WOMEN', 'WSL', 'Liga F', 'NWSL', 'GPFBL', 'Arkema', 'Femminile', 'Vrouwen', 'Feminino', 'Žen', 'Kvinner', 'Damen', 'Frauen']) expect(isWomenLeague(999, name)).toBe(true);
  expect(isWomenLeague(2, 'LALIGA EA SPORTS')).toBe(false);
});

test('prioritizes football nations and alphabetizes the rest', () => {
  const rows = ['Zambia', 'Brazil', 'Albania', 'France'].map(name => ({ name }));
  expect(sortAffiliations(rows, 'nations').map(r => r.name)).toEqual(['France', 'Brazil', 'Albania', 'Zambia']);
});
test('distinguishes major leagues from identically named leagues', () => {
  const rows = [{ id: 99, name: 'Premier League', short_name: 'RU1' }, { id: 2, name: 'La Liga', short_name: 'LAL' }, { id: 3, name: 'Premier League', short_name: 'EPL' }];
  expect(sortAffiliations(rows, 'leagues').map(r => r.short_name)).toEqual(['EPL', 'LAL', 'RU1']);
});

test.each(['league-filter', 'modal-league-filter'])('pins twelve IDs and preserves search in %s', selectId => {
  const rows = [
    { id: 10, name: 'Arkema PL' }, { id: 9, name: 'GPFBL' },
    { id: 7, name: 'MLS' }, { id: 14, name: 'ROSHN Saudi League' },
    { id: '8', name: 'NWSL' }, { id: 1, name: 'Barclays WSL' },
    { id: 6, name: 'Liga F Moeve' }, { id: 5, name: "Ligue 1 McDonald's" },
    { id: 12, name: 'Serie A Enilive' }, { id: 4, name: 'Bundesliga' },
    { id: 2, name: 'LALIGA EA SPORTS' }, { id: 3, name: 'Premier League' },
    { id: 99, name: 'Z League' }, { id: 98, name: 'A League' },
  ];
  expect(sortAffiliations(rows, 'leagues').map(row => Number(row.id))).toEqual([3, 2, 4, 12, 5, 6, 1, 8, 10, 9, 7, 14, 98, 99]);
  document.body.innerHTML = '<select id="league-filter"><option value="">All Leagues</option></select>';
  const select = document.querySelector('select');
  rows.forEach(row => select.add(new Option(row.name, row.id)));
  select.id = selectId;
  renderSearchableSelect(select, rows, { kind: 'league' });
  const list = document.querySelector('.nation-options');
  expect([...list.querySelectorAll('button')].map(b => b.textContent)).toEqual([
    'All Leagues', 'Premier League', 'LALIGA EA SPORTS', 'Bundesliga', 'Serie A Enilive',
    "Ligue 1 McDonald's", 'Liga F Moeve', 'Barclays WSL', 'NWSL', 'Arkema PL', 'GPFBL', 'MLS', 'ROSHN Saudi League', 'A League', 'Z League',
  ]);
  expect(list.querySelectorAll('hr')).toHaveLength(1);
  expect(list.querySelector('hr').previousElementSibling.textContent).toBe('ROSHN Saudi League');
  const input = document.querySelector('input');
  input.value = 'league';
  input.dispatchEvent(new Event('input'));
  expect([...list.querySelectorAll('button')].map(b => b.textContent)).toEqual(['All Leagues', 'A League', 'Premier League', 'ROSHN Saudi League', 'Z League']);
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
