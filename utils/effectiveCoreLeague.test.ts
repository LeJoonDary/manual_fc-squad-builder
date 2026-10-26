import { expect, test } from 'vitest';
import { calculateChemistry } from './chemistry';
import { calculateSquadChemistry, getEffectiveCoreLeague, getDynamicCandidatesForSlot, type GeneratedPlayer } from './autoBuildUtils';

const make = (id: string, extra: Partial<GeneratedPlayer> = {}): GeneratedPlayer => ({
  id, name: id, playerKey: id, position: 'CAM', slotPosition: 'CAM', nationId: 9, leagueId: 100,
  clubId: 9, price: 100, metaScore: 100, isOwned: false, isLocked: false, card: {}, ...extra,
});
const pl = [make('pl1'), make('pl2'), make('hero1', { isHero: true, clubId: 10 }), make('hero2', { isHero: true, clubId: 11 })];
const juste = make('juste', { nationId: 1, leagueId: 200, clubId: 2, isLocked: true });

test('four PL cards with two heroes have six points and yield to the zero-chemistry Eredivisie player', () => {
  const squad = [...pl, juste];
  expect(calculateSquadChemistry(squad, false).groupCounts.league['100']).toBe(6);
  expect(calculateSquadChemistry(squad, false).playerChemMap.juste).toBe(0);
  expect(getEffectiveCoreLeague(squad, '100')).toBe('200');
});

test('zero-chemistry leagues below three points take priority even before the old core reaches five', () => {
  expect(getEffectiveCoreLeague([make('pl1'), make('pl2'), juste], '100')).toBe('200');
});

test('Icon league contributions and a manager can graduate the core at five', () => {
  const squad = [make('one'), make('two'), make('hero', { isHero: true })];
  expect(getEffectiveCoreLeague(squad, '100')).toBe('100');
  expect(getEffectiveCoreLeague([...squad, make('icon', { isIcon: true, leagueId: 2118 })], '100')).toBeNull();
  const chemistry = calculateChemistry(squad.map(player => ({ position: player.slotPosition, player })), { leagueId: 100 });
  expect(chemistry.groupCounts.league['100']).toBe(5);
  expect(getEffectiveCoreLeague(squad, '100', true, chemistry)).toBeNull();
});

test.each([[5, 4, 2, '300'], [5, 3, 3, '200'], [4, 4, 3, '100']])(
  'hybrid %i-%i-%i keeps unfinished leagues available', (a, b, c, expected) => {
    const squad = [a, b, c].flatMap((count, group) => Array.from({ length: Number(count) }, (_, i) =>
      make(`${group}-${i}`, { leagueId: (group + 1) * 100, nationId: `${group}-${i}`, clubId: `${group}-${i}` })));
    expect(getEffectiveCoreLeague(squad, '100')).toBe(expected);
  },
);

test('Kuyt receives natural core priority inside the base 25 instead of only a reserve slot', () => {
  const pool = Array.from({ length: 25 }, (_, i) => make(`candidate${i}`, { metaScore: 1000 - i }));
  const kuyt = make('kuyt', { isHero: true, nationId: 1, leagueId: 200, metaScore: 80 });
  const squad = [...pl, juste];
  const ranked = getDynamicCandidatesForSlot('CAM', squad, [...pool, kuyt], 100, null, 25, '100');
  expect(ranked).toHaveLength(25);
  expect(ranked[0].id).toBe('kuyt');
});

test('missing leagues and wrong-position cards never create a core', () => {
  expect(getEffectiveCoreLeague([])).toBeNull();
  expect(getEffectiveCoreLeague([make('wrong', { slotPosition: 'GK' })])).toBeNull();
  expect(getEffectiveCoreLeague([make('missing', { leagueId: '' })])).toBeNull();
});
