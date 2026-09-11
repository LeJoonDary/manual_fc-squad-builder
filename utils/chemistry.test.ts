import { describe, expect, it } from 'vitest';
import type { PlayerCard, SquadSlot } from '../types/chemistry';
import { adaptChemistryPlayerCard, calculateChemistry, isPositionMatched } from './chemistry';

function card(id: string, overrides: Partial<PlayerCard> = {}): PlayerCard {
  return {
    id,
    name: `Player ${id}`,
    position: 'ST',
    nationId: Number(id) + 100,
    leagueId: Number(id) + 200,
    clubId: 10,
    ...overrides,
  };
}

function slot(position: string, player: PlayerCard | null): SquadSlot {
  return { position, player };
}

describe('calculateChemistry', () => {
  it.each(['ICON', 'SPECIAL_ICON', 'HERO', 'SPECIAL_HERO', 'NORMAL', 'SPECIAL'])(
    'uses normalized foreign keys and %s contributions', (card_type) => {
      const special = adaptChemistryPlayerCard({
        id: 'special', position: 'ST', card_type, club_id: 10, league_id: 20,
        nation_id: 999, players: { nation_id: 30, club_id: 999, league_id: 999 },
        isIcon: true, isHero: true,
      });
      const normal = adaptChemistryPlayerCard({
        id: 'normal', position: 'ST', card_type: 'NORMAL', club_id: 11, league_id: 21,
        players: { nation_id: 30 },
      });
      const result = calculateChemistry([slot('ST', special), slot('ST', normal)]);
      const icon = card_type.includes('ICON');
      const hero = card_type.includes('HERO');
      expect(result.groupCounts.nation).toEqual({ 'nation:id:30': icon ? 3 : 2 });
      expect(result.groupCounts.club).toEqual(icon || hero
        ? { 'club:id:11': 1 } : { 'club:id:10': 1, 'club:id:11': 1 });
      expect(result.groupCounts.league).toEqual(icon
        ? { 'league:id:21': 2 }
        : { 'league:id:20': hero ? 2 : 1, 'league:id:21': 1 });
    },
  );

  it('never groups null affiliations or invents an Icon league', () => {
    const players = ['ICON', 'SPECIAL_ICON', 'NORMAL', 'SPECIAL'].map((card_type, id) =>
      adaptChemistryPlayerCard({ id, position: 'ST', card_type,
        club_id: null, league_id: null, nation_id: null, club: 'Unknown Club' }));
    const result = calculateChemistry(players.map(player => slot('ST', player)));
    expect(result.groupCounts).toEqual({ club: {}, league: {}, nation: {} });
    expect(result.playerChemMap).toEqual({ 0: 3, 1: 3, 2: 0, 3: 0 });
  });

  it('keeps same-name affiliations separate by ID and boosts all represented leagues', () => {
    const players = [1, 2].map(id => adaptChemistryPlayerCard({
      id, position: 'ST', club_id: id, league_id: id, nation_id: id,
      club: 'Same name', league: 'Same name', nation: 'Same name',
    }));
    const icon = adaptChemistryPlayerCard({ id: 'icon', position: 'ST', card_type: 'ICON' });
    const result = calculateChemistry([...players, icon].map(player => slot('ST', player)));
    expect(result.groupCounts.league).toEqual({ 'league:id:1': 2, 'league:id:2': 2 });
    expect(result.groupCounts.club).toEqual({ 'club:id:1': 1, 'club:id:2': 1 });
    expect(calculateChemistry([...players.map(player => slot('ST', player)), slot('GK', icon)])
      .groupCounts.league).toEqual({ 'league:id:1': 1, 'league:id:2': 1 });
  });

  it('adds one league and nation count from the manager', () => {
    const france = 'nation:name:france';
    const premierLeague = 'league:name:premier league';
    const result = calculateChemistry([
      slot('ST', card('1', { nationId: france, leagueId: premierLeague, clubId: 'club-a' })),
      slot('ST', card('2', { nationId: 'nation:name:england', leagueId: premierLeague, clubId: 'club-b' })),
    ], { nationId: france, leagueId: premierLeague });

    expect(result.groupCounts.league[premierLeague]).toBe(3);
    expect(result.groupCounts.nation[france]).toBe(2);
    expect(result.playerChemMap['1']).toBe(2);
    expect(result.playerChemMap['2']).toBe(1);
  });

  it('gives each player one chemistry when two in-position players share a club', () => {
    const result = calculateChemistry([
      slot('ST', card('1')),
      slot('ST', card('2')),
    ]);

    expect(result.playerChemMap).toEqual({ '1': 1, '2': 1 });
    expect(result.totalChemistry).toBe(2);
  });

  it('applies an Icon nation weight of +2 and fixes the Icon chemistry at three', () => {
    const sharedNation = 7;
    const result = calculateChemistry([
      slot('CM', card('1', { position: 'CM', nationId: sharedNation, isIcon: true })),
      slot('ST', card('2', { nationId: sharedNation, clubId: 12 })),
      slot('ST', card('3', { nationId: sharedNation, clubId: 13 })),
      slot('ST', card('4', { nationId: sharedNation, clubId: 14 })),
    ]);

    expect(result.playerChemMap['1']).toBe(3);
    expect(result.groupCounts.nation['7']).toBe(5);
    expect(result.playerChemMap['2']).toBe(2);
    expect(result.playerChemMap['3']).toBe(2);
    expect(result.playerChemMap['4']).toBe(2);
    expect(result.totalChemistry).toBe(9);
  });

  it('gives Mbappé one nation chemistry with Zidane across camelCase and DB key shapes', () => {
    const zidane = adaptChemistryPlayerCard({
      id: 'zidane',
      name: 'Zinedine Zidane',
      position: 'CAM',
      nation: 'France',
      nationId: 2,
      league: 'Icons',
      leagueId: 900,
      club: 'Icons',
      clubId: 900,
      isIcon: true,
    });
    const mbappe = adaptChemistryPlayerCard({
      card_id: 'mbappe',
      player_name: 'Kylian Mbappé',
      primary_position: 'ST',
      nation: 'France',
      nation_id: 2,
      league: 'LALIGA',
      league_id: 101,
      club: 'Real Madrid',
      club_id: 10,
    });
    const result = calculateChemistry([
      slot('CAM', zidane),
      slot('ST', mbappe),
    ]);

    expect(zidane.nationId).toBe(mbappe.nationId);
    expect(result.groupCounts.nation[String(zidane.nationId)]).toBe(3);
    expect(result.playerChemMap.zidane).toBe(3);
    expect(result.playerChemMap.mbappe).toBe(1);
    expect(result.totalChemistry).toBe(4);
  });

  it('keeps Mbappé in position at both primary ST and alt_positions LW after a move', () => {
    const zidane = adaptChemistryPlayerCard({
      id: 'zidane-position-test',
      name: 'Zinedine Zidane',
      position: 'CAM',
      nation: 'France',
      league: 'Icons',
      club: 'Icons',
      isIcon: true,
    });
    const mbappe = adaptChemistryPlayerCard({
      id: 'mbappe-position-test',
      name: 'Kylian Mbappé',
      position: 'ST',
      altPositions: [],
      alt_positions: [' lw '],
      nation: 'France',
      league: 'LALIGA',
      club: 'Real Madrid',
    });

    const atStriker = calculateChemistry([slot('CAM', zidane), slot('ST', mbappe)]);
    const atLeftWing = calculateChemistry([slot('CAM', zidane), slot('LW', mbappe)]);
    const outOfPosition = calculateChemistry([slot('CAM', zidane), slot('RW', mbappe)]);

    expect(mbappe.position).toBe('ST');
    expect(mbappe.altPositions).toEqual(['LW']);
    expect(isPositionMatched('LW', mbappe)).toBe(true);
    expect(isPositionMatched(' lw ', mbappe)).toBe(true);
    expect(atStriker.playerChemMap['mbappe-position-test']).toBe(1);
    expect(atLeftWing.playerChemMap['mbappe-position-test']).toBe(1);
    expect(outOfPosition.playerChemMap['mbappe-position-test']).toBe(0);
  });

  it('normalizes formation-specific midfield slots before position matching', () => {
    const midfielder = card('8', { position: 'CM', altPositions: [] });
    const result = calculateChemistry([
      slot('LCM', midfielder),
      slot('RCM', card('9', { position: 'CM', clubId: midfielder.clubId })),
    ]);

    expect(result.playerChemMap['8']).toBe(1);
    expect(result.playerChemMap['9']).toBe(1);
  });

  it('sets an out-of-position player to zero and excludes it from every count', () => {
    const result = calculateChemistry([
      slot('ST', card('1')),
      slot('CM', card('2')),
    ]);

    expect(result.playerChemMap).toEqual({ '1': 0, '2': 0 });
    expect(result.totalChemistry).toBe(0);
  });

  it('accepts an alternate position and caps each player at three chemistry', () => {
    const players = Array.from({ length: 8 }, (_, index) => card(String(index + 1), {
      position: 'ST',
      altPositions: ['CF'],
      nationId: 1,
      leagueId: 2,
      clubId: 3,
    }));
    const result = calculateChemistry(players.map((player) => slot('CF', player)));

    expect(Object.values(result.playerChemMap).every((chemistry) => chemistry === 3)).toBe(true);
    expect(result.totalChemistry).toBe(24);
  });
});
