import { expect, test, vi } from 'vitest';
import { getRecommendedPlayersForEmptySlot as recommend, getEmptySlotPriceCap, passesNewCandidateFilter, pureMetaScore } from './autoBuildUtils';
const card = (id: number, extra = {}) => ({ id, player_id: id, position: 'CM', overall: 90,
  pac: 90, sho: 90, pas: 90, dri: 90, def: 90, phy: 90, price: 1000,
  nationId: 'ES', leagueId: 'L1', clubId: `C${id}`, ...extra });
const locked = (c: any) => ({ card: c, isLocked: true });
const options = (extra = {}) => ({ formation: '4-3-3', slotPosition: 'CM', totalBudget: 0,
  currentSquad: { LB: locked(card(1, { position: 'LB' })) }, ...extra });
const run = (cards: any[], extra = {}) => recommend(null as any, options(extra), cards);

test('no locked player disables synergy mode', async () => {
  expect(await run([card(2)], { sort: 'meta_synergy', currentSquad: { LB: { card: card(1), isLocked: false } } })).toEqual([]);
});
test.each(['LB', 'RB'])('explicit price permits 80–84 OVR %s and preserves auto-build ratio', async position => {
  const cheap = card(2, { position, overall: 83, price: 30000 });
  const result = await run([cheap, card(3, { position, price: 30001 })], {
    slotPosition: position, slotMaxPrice: 30000, currentSquad: { GK: locked(card(1, { position: 'GK' })) },
  });
  expect(result.map(r => r.card.id)).toEqual([2]);
  expect(passesNewCandidateFilter(cheap, position, 30000)).toBe(false);
});
test('DB price and lowered overall filters run before LIMIT', async () => {
  const calls: any[] = [];
  const query: any = {};
  for (const method of ['select', 'eq', 'gte', 'lte', 'gt', 'not', 'order']) query[method] = (...args: any[]) => { calls.push([method, ...args]); return query; };
  query.limit = vi.fn(async () => ({ data: [], error: null }));
  await recommend({ from: () => query } as any, options({ slotMaxPrice: 10000 }));
  expect(calls).toContainEqual(['lte', 'price', 10000]);
  expect(calls).toContainEqual(['gte', 'overall', 80]);
  expect(query.limit).toHaveBeenCalledWith(300);
});
test('zero-delta league bridge remains in meta tab', async () => {
  const rows = await run([card(2, { nationId: 'FR' })]);
  expect(rows).toHaveLength(1);
  expect(rows[0].chemDelta).toBe(0);
  expect(await run([card(2, { nationId: 'FR' })], { sort: 'instant_chem' })).toEqual([]);
});
test('three leagues block unrelated new league; hero and icon expand league capacity', async () => {
  const squad = { LB: locked(card(1, { position: 'LB' })), RB: locked(card(2, { position: 'RB', leagueId: 'L2' })), GK: locked(card(3, { position: 'GK', leagueId: 'L3' })) };
  expect(await run([card(20, { leagueId: 'L4', nationId: 'ZZ' })], { currentSquad: squad })).toEqual([]);
  for (const special of [{ isIcon: true }, { isHero: true, leagueId: 'L4' }]) {
    const currentSquad = { ...squad, LW: locked(card(4, { position: 'LW', ...special })) };
    expect(await run([card(20, { leagueId: 'L4' })], { currentSquad })).toHaveLength(1);
  }
});
test('four/five locked leagues still accept existing leagues, icons and linked heroes', async () => {
  for (const count of [4, 5]) {
    const positions = ['LB', 'RB', 'LCB', 'RCB', 'GK'];
    const currentSquad = Object.fromEntries(positions.slice(0,count).map((position,i) => [position, locked(card(i+1,{position,leagueId:`L${i+1}`}))]));
    const result = await run([card(20), card(21, { isIcon: true, leagueId: 'IC' }), card(22, { isHero: true, leagueId: 'NEW' })], {currentSquad});
    expect(result.map(r => r.card.id).sort()).toEqual([20,21,22]);
  }
});
test('icon-only squad supports same-nation ordinary players, heroes and icons', async () => {
  const result = await run([card(20), card(21,{isHero:true}), card(22,{isIcon:true,nationId:'FR'})], {
    currentSquad: { GK: locked(card(1,{position:'GK',isIcon:true,leagueId:'IC'})) },
  });
  expect(result).toHaveLength(3);
});
test('hard caps, exclusions, duplicates, role requirements and special limits apply', async () => {
  expect(await run([card(2,{pac:10}), card(3), card(4,{player_id:1}), card(5,{isIcon:true})], {
    excludedCardVersionIds:[3], maxIcons:0,
  })).toEqual([]);
  expect(await run([card(2)],{slotRequirements:{CM:{minSm:5}}})).toEqual([]);
});
test('remaining budget reserves unowned pitch players and explicit cap wins', () => {
  expect(getEmptySlotPriceCap(options({totalBudget:20000}))).toBe(19000);
  expect(getEmptySlotPriceCap(options({totalBudget:20000,slotMaxPrice:30000}))).toBe(30000);
});

test('instant chemistry keeps threshold fillers and sorts chemistry before meta', async () => {
  const currentSquad = {
    LB: locked(card(1, {position:'LB',nationId:'ES'})),
    RB: locked(card(2, {position:'RB',nationId:'FR'})),
  };
  const result = await run([card(20,{nationId:'DE',clubId:'other'}), card(21,{nationId:'ES',clubId:'C1'})], {
    currentSquad, sort:'instant_chem',
  });
  expect(result).toHaveLength(2);
  expect(result[0].card.id).toBe(21);
  expect(result.every(r=>r.hitsDeficit || r.chemDelta>0)).toBe(true);
});

test('recommendation exposes a finite slot metaScore without changing ranking score', async () => {
  const result = await run([card(2), card(3, {meta_score:NaN})]);
  expect(result.length).toBeGreaterThan(0);
  for (const row of result) {
    expect(Number.isFinite(row.metaScore)).toBe(true);
    expect(row.metaScore).toBe(row.meta);
    expect(row.metaScore).toBe(pureMetaScore(row.card, 'CM'));
    expect(Number.isFinite(row.score)).toBe(true);
  }
});
