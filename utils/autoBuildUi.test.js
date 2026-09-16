import { describe, expect, it } from 'vitest';
import { autoBuildManagerState } from './autoBuildUi.js';
import { adaptChemistryPlayerCard } from './chemistry.ts';

describe('autoBuildManagerState', () => {
  it('round-trips simulation IDs through the existing UI chemistry adapter', () => {
    const state = autoBuildManagerState({ bestLeagueId: 'league:id:20', bestNationId: 'nation:id:30' },
      { leagues: [{ id: 20, name: 'League' }], nations: [{ id: 30, name: 'Nation' }] }, []);
    expect(state).toMatchObject({ leagueId: '20', nationId: '30', league: 'League', nation: 'Nation' });
    const adapted = adaptChemistryPlayerCard({ league_id: state.leagueId, nation_id: state.nationId });
    expect(adapted.leagueId).toBe('league:id:20');
    expect(adapted.nationId).toBe('nation:id:30');
  });
  it('handles no manager and partial affiliations without inventing chemistry', () => {
    const catalog = { leagues: [], nations: [] };
    expect(autoBuildManagerState(null, catalog, [])).toBeNull();
    const state = autoBuildManagerState({ bestLeagueId: null, bestNationId: 'nation:id:3' }, catalog, [{ nation_id: 3, nation: 'France' }]);
    expect(state).toMatchObject({ leagueId: null, nationId: '3', nation: 'France' });
    expect(adaptChemistryPlayerCard({ league_id: state.leagueId, league: state.league }).leagueId).toBe('');
  });
});
