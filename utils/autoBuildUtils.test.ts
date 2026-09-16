import { describe, expect, it } from 'vitest';
import { findBestManager, type AutoBuildPlayer } from './autoBuildUtils';
import { adaptChemistryPlayerCard, calculateChemistry } from './chemistry';

const player = (id: string, leagueId: string | number, nationId: string | number, extra = {}): AutoBuildPlayer => ({
  id, name: id, position: 'ST', leagueId, nationId, clubId: id, ...extra,
});

describe('findBestManager', () => {
  it('selects the best joint bonus and does not mutate the squad', () => {
    const players = [player('1', 'A', 'A'), player('2', 'A', 'B'), player('3', 'B', 'A'), player('4', 'C', 'C')];
    const before = structuredClone(players);
    expect(findBestManager(players)).toEqual({ bestLeagueId: 'A', bestNationId: 'B', maxChemistry: 5, addedChemistry: 3 });
    expect(players).toEqual(before);
  });

  it('handles empty squads and missing affiliations', () => {
    expect(findBestManager([])).toEqual({ bestLeagueId: null, bestNationId: null, maxChemistry: 0, addedChemistry: 0 });
    expect(findBestManager([player('1', '', 'N')])).toEqual({ bestLeagueId: null, bestNationId: 'N', maxChemistry: 1, addedChemistry: 1 });
    expect(findBestManager([player('1', 'L', ''), player('2', 'L', '')]))
      .toEqual({ bestLeagueId: 'L', bestNationId: null, maxChemistry: 2, addedChemistry: 2 });
  });

  it('keeps the first tied candidate, including when no bonus is possible', () => {
    expect(findBestManager([player('1', 2, 3, { isHero: true })]))
      .toEqual({ bestLeagueId: 2, bestNationId: 3, maxChemistry: 3, addedChemistry: 0 });
  });

  it('uses canonical UI cards and existing Icon/Hero rules for every candidate', () => {
    const players = [
      adaptChemistryPlayerCard({ id: '1', position: 'ST', league_id: 1, nation_id: 1, card_type: 'ICON' }),
      adaptChemistryPlayerCard({ id: '2', position: 'ST', league_id: 2, nation_id: 2, card_type: 'HERO' }),
      adaptChemistryPlayerCard({ id: '3', position: 'ST', league_id: 2, nation_id: 1 }),
      adaptChemistryPlayerCard({ id: '4', position: 'ST', league_id: 3, nation_id: 3 }),
    ];
    const slots = players.map(player => ({ position: player.position, player }));
    const scores = players.flatMap(a => players.map(b => calculateChemistry(slots, { leagueId: a.leagueId, nationId: b.nationId }).totalChemistry));
    const result = findBestManager(players);
    expect(result.maxChemistry).toBe(Math.max(...scores));
    expect(result.addedChemistry).toBe(result.maxChemistry - calculateChemistry(slots).totalChemistry);
    expect(players.map(p => p.leagueId)).toContain(result.bestLeagueId);
    expect(players.map(p => p.nationId)).toContain(result.bestNationId);
  });

  it('respects assigned slots instead of giving out-of-position players chemistry', () => {
    expect(findBestManager([player('1', 'A', 'N', { slotPosition: 'GK' })]).maxChemistry).toBe(0);
    expect(findBestManager([player('1', 'A', 'N', { slotPosition: 'RW', altPositions: ['RW'] })]).maxChemistry).toBe(1);
  });

  it('supports 11 players at the 33 point cap and rejects oversized squads', () => {
    const players = Array.from({ length: 11 }, (_, i) => player(String(i), 'L', 'N'));
    expect(findBestManager(players).maxChemistry).toBe(33);
    expect(findBestManager(players).addedChemistry).toBe(0);
    expect(() => findBestManager([...players, player('12', 'L', 'N')])).toThrow(RangeError);
  });
});
