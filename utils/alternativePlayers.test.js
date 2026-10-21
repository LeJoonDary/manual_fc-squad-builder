import { describe, expect, it } from 'vitest';
import { suggestAlternativePlayers, suggestAlternativePlayersAsync, fetchAlternativeCards, getSwapConflicts } from './alternativePlayers.js';
import { adaptChemistryPlayerCard, calculateChemistry } from './chemistry.ts';
import { autoBuildManagerState } from './autoBuildUi.js';
const card = (id, extra = {}) => ({ id, name: id, position: 'CB', overall: 80, nation_id: 1, league_id: 1, club_id: 1, ...extra });
const squad = { LCB: { card: card('current') }, RCB: { card: card('fixed') } };
const suggest = (candidates, extra = {}) => suggestAlternativePlayers({ squad, targetPosition: 'LCB', candidates, minChemistryTarget: 0, limit: 10, ...extra });

describe('alternative players', () => {
  it('lowers OVR to 75 only below five eligible 80+ cards, after position and budget filters', async () => {
    const high = Array.from({ length: 5 }, (_, i) => card(`high${i}`, { overall: 80, price: 100 }));
    const lower = [card('lower', { overall: 75, price: 100 }), card('silver', { overall: 74, price: 100 })];
    const options = { squad, targetPosition: 'LCB', minChemistryTarget: 0, maxBudget: 100 };
    for (const run of [suggestAlternativePlayers, suggestAlternativePlayersAsync]) {
      expect((await run({ ...options, candidates: [...high, ...lower] })).map(row => row.card.id))
        .toEqual(high.map(row => row.id));
      const result = await run({ ...options, candidates: [...high.slice(0, 4), ...lower,
        card('expensive', { overall: 99, price: 101 }), card('wrong', { overall: 99, position: 'GK' })] });
      expect(result.map(row => row.card.id)).toEqual([...high.slice(0, 4).map(row => row.id), 'lower']);
    }
  });
  it('sorts regular cards before both heroes and icons, then OVR descending and price ascending', () => {
    const result = suggest([card('hero', { version: 'Hero', overall: 99 }),
      card('icon', { version: 'Icon', overall: 98 }), card('expensive', { overall: 85, price: 200 }),
      card('cheap', { overall: 85, price: 100 }), card('top', { overall: 90, price: 300 })]);
    expect(result.map(row => row.card.id)).toEqual(['top', 'cheap', 'expensive', 'hero', 'icon']);
  });
  it('sorts eligible gold and special cards before icons and omits silver and bronze', async () => {
    const candidates = [
      card('silver', { overall: 74 }), card('bronze', { overall: 64 }),
      card('icon99', { overall: 99, is_icon: true }), card('gold75', { overall: 75 }),
      card('special90', { overall: 90, version: 'special_hall_of_fut' }),
      card('icon80', { overall: 80, league: 'Icons' }),
    ];
    const options = { squad, targetPosition: 'LCB', candidates, minChemistryTarget: 0 };
    const expected = ['special90', 'gold75', 'icon99', 'icon80'];
    expect(suggestAlternativePlayers(options).map(row => row.card.id)).toEqual(expected);
    expect((await suggestAlternativePlayersAsync(options)).map(row => row.card.id)).toEqual(expected);
    expect(suggestAlternativePlayers({ ...options, settings: { maxIcons: 0 } }).map(row => row.card.id))
      .toEqual(['special90', 'gold75']);
  });
  it('rescues a 31-chemistry squad with a manager and preserves a sufficient current manager', () => {
    const positions = ['LB', 'LCB', 'RCB', 'RB', 'LCM', 'CM', 'RCM', 'CAM', 'LS', 'RS', 'GK'];
    const team = Object.fromEntries(positions.map((position, i) => [position, {
      card: card(`p${i}`, { position, league_id: i < 9 ? 1 : 2, nation_id: i < 9 ? 1 : 2, club_id: i < 9 ? 1 : 2 }),
    }]));
    const replacement = card('newGK', { position: 'GK', league_id: 2, nation_id: 2, club_id: 2 });
    const options = { squad: team, targetPosition: 'GK', candidates: [replacement], minChemistryTarget: 33,
      manager: { leagueId: 'league:id:1', nationId: 'nation:id:1' } };
    const slots = positions.map(position => ({ position, player: adaptChemistryPlayerCard(position === 'GK' ? replacement : team[position].card) }));
    expect(calculateChemistry(slots, options.manager).totalChemistry).toBe(31);
    const result = suggestAlternativePlayers(options);
    expect(result).toHaveLength(1);
    expect(result[0].totalChemistry).toBe(33);
    expect(result[0].bestManager.leagueId).toBe('league:id:2');
    const state = autoBuildManagerState({
      bestLeagueId: result[0].bestManager.leagueId, bestNationId: result[0].bestManager.nationId,
    }, { leagues: [{ id: 2, name: 'League Two' }], nations: [{ id: 1, name: 'Nation One' }] }, [replacement]);
    expect(state.leagueId).toBe('2');
    expect(state.league).toBe('League Two');
    const current = { leagueId: 'league:id:2', nationId: 'nation:id:2' };
    expect(suggestAlternativePlayers({ ...options, manager: current })[0].bestManager).toBe(current);
  });
  it('includes eligible icons after standard cards and respects exclusions and budget', async () => {
    const full = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`slot${i}`, { card: card(`fixed${i}`) }]));
    // Use actual CB slots for the chemistry calculator.
    const fixedSquad = { LCB: full.slot0, ...Object.fromEntries(Object.values(full).slice(1).map((entry, i) =>
      [`CB${i}`, { ...entry, card: { ...entry.card, alt_positions: [`CB${i}`] } }])) };
    const icon = card('icon', { version: 'Icon', price: 100 });
    const unrelated = card('unrelated', { nation_id: 2, league_id: 2, club_id: 2 });
    const options = { squad: fixedSquad, targetPosition: 'LCB', candidates: [unrelated, icon], minChemistryTarget: 33 };
    const result = await suggestAlternativePlayersAsync(options);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ isIcon: true, totalChemistry: 33, card: { id: 'icon' } });
    expect(await suggestAlternativePlayersAsync({ ...options, settings: { maxIcons: 0 } })).toEqual([]);
    expect(await suggestAlternativePlayersAsync({ ...options, maxBudget: 99 })).toEqual([]);
    expect(await suggestAlternativePlayersAsync({ ...options, settings: { excludedCardVersionIds: ['icon'] } })).toEqual([]);
    const standard = await suggestAlternativePlayersAsync({ ...options, candidates: [card('normal'), icon] });
    expect(standard.map(row => row.card.id)).toEqual(['normal', 'icon']);
    const relaxed = await suggestAlternativePlayersAsync({ ...options, minChemistryTarget: 30 });
    expect(relaxed.map(row => row.card.id)).toEqual(['unrelated', 'icon']);
    expect(suggestAlternativePlayers({ ...options, candidates: [icon] })[0].isIcon).toBe(true);
  });
  it('checks conflicts only in the other slots and only for Exclude', () => {
    const mixed = { LCB: { card: card('hero', { version: 'Hero' }) }, RCB: { card: card('icon', { club: 'ICON' }) } };
    expect(getSwapConflicts(mixed, 'RCB', { maxHeroes: 0, maxIcons: 0 })).toEqual(['Hero']);
    expect(getSwapConflicts(mixed, 'LCB', { maxHeroes: 0, maxIcons: 0 })).toEqual(['Icon']);
    expect(getSwapConflicts(mixed, 'LCB', { maxHeroes: 0 })).toEqual([]);
    expect(getSwapConflicts(mixed, 'CM', { maxHeroes: 1, maxIcons: null })).toEqual([]);
    expect(getSwapConflicts(mixed, 'CM', { maxHeroes: 0, maxIcons: 0 })).toEqual(['Hero', 'Icon']);
  });
  it('returns all eligible candidates in OVR order without lowering the chemistry target', async () => {
    const candidates = Array.from({ length: 26 }, (_, i) => card(`c${i}`, { overall: 99 - i, pac: 40 + i * 2 }));
    const result = await suggestAlternativePlayersAsync({ squad, targetPosition: 'LCB', candidates, minChemistryTarget: 4 });
    expect(result).toHaveLength(20);
    expect(result.every((row, i) => !i || result[i - 1].card.overall >= row.card.overall)).toBe(true);
    expect(await suggestAlternativePlayersAsync({ squad, targetPosition: 'LCB', candidates, minChemistryTarget: 7 })).toEqual([]);
  });
  it('enforces remaining squad budget and inclusive price filters', () => {
    const budgetSquad = { LCB: { card: card('current', { price: 300 }) }, RCB: { card: card('fixed', { price: 700 }) } };
    const candidates = [card('cheap', { price: 99 }), card('edge', { price: 300 }), card('over', { price: 301 })];
    expect(suggest(candidates, { squad: budgetSquad, maxBudget: 1000, minPrice: 100, maxPrice: 300 })
      .map(row => row.card.id)).toEqual(['edge']);
    expect(suggest(candidates, { squad: budgetSquad, maxBudget: 600 })).toEqual([]);
    expect(suggest(candidates, { squad: budgetSquad, maxBudget: 0 })).toHaveLength(3);
    budgetSquad.LCB.isOwned = true;
    expect(suggest(candidates, { squad: budgetSquad, maxBudget: 1000 })).toHaveLength(2);
    budgetSquad.RCB.isOwned = true;
    expect(suggest(candidates, { squad: budgetSquad, maxBudget: 1000 })).toHaveLength(3);
  });
  it('does not lower OVR based on chemistry failures when five high-rated candidates exist', async () => {
    const candidates = Array.from({ length: 210 }, (_, i) => card(`unlinked${i}`, {
      overall: 99, pac: 99, nation_id: 2, league_id: 2, club_id: 2,
    }));
    candidates.push(card('late', { overall: 75, pac: 60 }));
    const result = await suggestAlternativePlayersAsync({ squad, targetPosition: 'LCB', candidates, minChemistryTarget: 4 });
    expect(result).toEqual([]);
    const controller = new AbortController();
    controller.abort();
    await expect(suggestAlternativePlayersAsync({ squad, targetPosition: 'LCB', candidates }, controller.signal)).rejects.toThrow();
  });
  it('strictly filters target chemistry and leaves the fixed squad untouched', () => {
    const before = JSON.stringify(squad);
    const result = suggest([card('high', { overall: 99, nation_id: 2, club_id: 2, league_id: 2 }), card('linked')], { minChemistryTarget: 4 });
    expect(result.map(item => item.card.id)).toEqual(['linked']);
    expect(result[0]).toMatchObject({ totalChemistry: 4, playerChemistry: 2 });
    expect(JSON.stringify(squad)).toBe(before);
  });
  it('keeps every qualified card regardless of score, sorting by OVR', () => {
    const good = Array.from({ length: 10 }, (_, i) => card(`fast${i}`, { overall: 80 + i, pac: 95 - i, def: 90, phy: 90 }));
    const result = suggest([...good, card('inflated', { overall: 99, pac: 30, def: 30, phy: 30 })]);
    expect(result).toHaveLength(11);
    expect(result.map(row => row.card.overall)).toEqual([99, 89, 88, 87, 86, 85, 84, 83, 82, 81, 80]);
    expect(suggest(good.slice(0, 3), { minChemistryTarget: 4 })).toHaveLength(3);
    expect(suggest(good, { minChemistryTarget: 33 })).toEqual([]);
  });
  it('puts icons identified by affiliation or identity after standard cards', () => {
    const result = suggest([card('league', { league: 'Icons' }), card('club', { club: 'ICON' }),
      card('id', { league_id: 2118 }), card('version', { version: 'Prime Icon' }), card('normal')]);
    expect(result.map(row => row.card.id)).toEqual(['normal', 'club', 'id', 'league', 'version']);
  });
  it('excludes current, occupied, duplicate, banned and wrong-position cards; accepts secondary positions', () => {
    expect(suggest([
      card('current'), card('fixed'), card('banned'), card('wrong', { position: 'ST' }),
      card('secondary', { position: 'LB', alt_positions: ['CB'] }), card('secondary'),
    ], { settings: { excludedCardVersionIds: ['banned'] } }).map(item => item.card.id)).toEqual(['secondary']);
  });
  it('applies special, gender and rating restrictions', () => {
    const result = suggest([card('icon', { version: 'Icon' }), card('hero', { version: 'Hero' }),
      card('woman', { gender: 'Female' }), card('low', { overall: 60 }), card('ok')],
    { settings: { maxIcons: 0, maxHeroes: 0, maxFemalePlayers: 'exclude', squadOvrRange: { min: 75, max: 99 } } });
    expect(result.map(item => item.card.id)).toEqual(['ok']);
  });
  it('includes manager chemistry and returns every eligible candidate', () => {
    const cards = Array.from({ length: 12 }, (_, i) => card(`c${i}`, { overall: 80 + i }));
    const result = suggest(cards, { manager: { leagueId: 'league:id:1' } });
    expect(result).toHaveLength(12);
    expect(result[0]).toMatchObject({ totalChemistry: 6, playerChemistry: 3, card: { overall: 91 } });
  });
  it('counts fixed icons toward the cap', () => {
    const fixedSquad = { ...squad, RCB: { card: card('fixed', { version: 'Icon' }) } };
    expect(suggest([card('new', { version: 'Icon' })], { squad: fixedSquad, settings: { maxIcons: 1 } })).toEqual([]);
  });
  it('loads beyond the first page before ranking', async () => {
    const ranges = [];
    const db = { from: () => {
      const query = {
        select: () => query, eq: () => query, order: () => query,
        range: (start, end) => { ranges.push([start, end]); return Promise.resolve({ data: start === 0 ? Array.from({ length: 500 }, (_, i) => card(String(i))) : [card('last')] }); },
      };
      return query;
    } };
    expect(await fetchAlternativeCards(db, 'LCB')).toHaveLength(501);
    expect(ranges).toEqual([[0, 499], [500, 999]]);
  });
});
