import { expect, test } from 'vitest';
import { FORMATIONS } from './formations.js';
import { adaptChemistryPlayerCard } from './chemistry';
import { calculateMetaScore, calculateSquadChemistry, passesNewCandidateFilter, upgradeSquadToTargetBudgetRatio } from './autoBuildUtils';

test.each(['LB','RB','LWB','RWB'])('%s accepts exactly pace 82 at every budget', pos => {
  for (const budget of [0, 200000, 300000, 499999, 500000, 1000000]) for (const pac of [80,81,82,83]) {
    expect(passesNewCandidateFilter({ pac, phy: 65, price: 1000 }, pos, budget)).toBe(pac >= 82);
  }
});
test.each(['ST','CF','LS','RS'])('%s physicality follows the budget boundary in every card shape', pos => {
  for (const budget of [0, 200000, 300000, 499999, 500000, 1000000]) for (const phy of [57,65,66,68,69,70]) {
    for (const stats of [{ phy }, { facePhysicality: phy }, { player_stats: [{ phy }] }, { face_stats: { phy } }]) {
      const card = { price: 1000, pac: 90, ...stats };
      for (const input of [card, { card }, { raw: card }]) {
        expect(passesNewCandidateFilter(input, pos, budget)).toBe(phy >= (budget >= 500000 ? 70 : 66));
      }
    }
  }
});

const make = (id: number, position: string, price: number, rating: number, locked = false) => {
  const card = { id, player_id: id, position, price, overall: rating, pac: 90, phy: 80,
    sho: rating, dri: rating, def: rating, pas: rating, league_id: 100, nation_id: 1, club_id: 1, isIcon: locked };
  return { ...adaptChemistryPlayerCard(card), card, id: String(id), playerKey: String(id), slotPosition: position,
    price, isLocked: locked, isOwned: false, metaScore: calculateMetaScore(card, position) };
};
const squad = (price: number, rating: number, lockPrice = 1000) => FORMATIONS.find(f => f.name === '4-3-3')!.slots
  .map((s, i) => make(i, s.position, s.position === 'ST' ? price : lockPrice, s.position === 'ST' ? rating : 85, s.position !== 'ST'));

test('cheap best-in-slot card is never replaced by equal or weaker expensive cards', () => {
  const current = squad(750, 99);
  const result = upgradeSquadToTargetBudgetRatio(current, 1000000,
    { ST: [make(100, 'ST', 300000, 99), make(101, 'ST', 200000, 95)] }, false);
  expect(result).toBe(current);
});
test.each([50000, 100000])('better card at price %s can replace at full budget with no spare coins', price => {
  const current = squad(100000, 80, 90000);
  const snapshot = structuredClone(current);
  const result = upgradeSquadToTargetBudgetRatio(current, 1000000, { ST: [make(100, 'ST', price, 99)] }, false);
  expect(result.find(p => p.slotPosition === 'ST')?.id).toBe('100');
  expect(calculateSquadChemistry(result, false).totalChemistry).toBe(33);
  expect(result.reduce((sum, p) => sum + p.price, 0)).toBeLessThanOrEqual(1000000);
  expect(current).toEqual(snapshot);
  expect(result.filter(p => p.isLocked)).toEqual(current.filter(p => p.isLocked));
});
test('upgrade evaluates playstyle points exactly once', () => {
  const current = squad(1000, 85);
  const candidate = make(100, 'ST', 2000, 85);
  candidate.card['playstylesPlus'] = [7];
  const upgraded = upgradeSquadToTargetBudgetRatio(current, 1000000, { ST: [candidate] }, false);
  expect(upgraded.find(p => p.slotPosition === 'ST')?.id).toBe('100');
  expect(calculateMetaScore(candidate, 'ST') - calculateMetaScore(current.find(p => p.slotPosition === 'ST'), 'ST')).toBe(30);
});

test('a stronger affordable replacement cannot downgrade a 33-chemistry squad', () => {
  const current = FORMATIONS.find(f => f.name === '4-3-3')!.slots.map((slot, i) =>
    ({ ...make(i, slot.position, 1000, 85), isLocked: slot.position !== 'ST' }));
  const candidate = { ...make(100, 'ST', 2000, 99), clubId: 'other-club', leagueId: 'other-league', nationId: 'other-nation' };
  expect(calculateSquadChemistry(current, false).totalChemistry).toBe(33);
  expect(upgradeSquadToTargetBudgetRatio(current, 1000000, { ST: [candidate] }, false, {}, 30)).toBe(current);
});
