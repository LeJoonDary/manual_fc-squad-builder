import { mockCandidate } from './candidateDb.js';

export function createSquadCandidateRows() {
  return ['LW', 'ST', 'RW', 'CM', 'CM', 'CM', 'LB', 'CB', 'CB', 'RB', 'GK'].flatMap((position, i) =>
    [0, 1, 2].map(tier => {
      const id = i * 3 + tier + 1;
      const score = 78 + tier * 5;
      return { ...mockCandidate(id, [position], 30000 + tier * 30000, 99 - tier),
        player_id: id, players: { id, name: `선수 ${id}`, nation_id: 1 }, club_id: 1, league_id: 1,
        wf: 4, sm: 4,
        player_stats: { pac: score, sho: score, pas: score, dri: score, def: score, phy: score,
          gk_diving: score, gk_handling: score, gk_kicking: score, gk_positioning: score, gk_reflexes: score } };
    }));
}
