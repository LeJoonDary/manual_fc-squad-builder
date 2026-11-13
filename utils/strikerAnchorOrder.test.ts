import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fetchCandidatePlayers, pureMetaScore, generateOptimalSquad, getDynamicCandidatesForSlot, type GeneratedPlayer } from './autoBuildUtils';
import { createCandidateMockDb } from '../scripts/mocks/candidateDb.js';
import fixture from '../scripts/mocks/strikerAnchorCandidates.json';

beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0));
afterEach(() => vi.restoreAllMocks());

test.each([false, true])('ignores unlocked pitch cards across five builds with the same random draw, reversed pool=%s', async reverse => {
  // Market snapshot: Gordon also shares Barcelona with the two locked anchors.
  const prices: Record<string, number> = { '22': 131000, '294': 56500, '20175': 21000 };
  const pool = fixture.candidates.map(card => ({ ...card, price: prices[card.id] ?? card.price }));
  if (reverse) pool.reverse();
  let options: any = structuredClone(fixture.options);
  let firstSquad: string[] | undefined;
  for (let run = 0; run < 5; run++) {
    const result = await generateOptimalSquad('4-3-1-2', pool as any, 300000, 33, true, options);
    expect(result.success).toBe(true);
    expect(result.totalChemistry).toBe(33);
    expect(result.totalCost).toBeLessThanOrEqual(300000);
    expect(result.squad.find(p => p.slotPosition === 'LS')?.id).toBe('22');
    expect(result.squad.find(p => p.slotPosition === 'LS')?.price).toBe(131000);
    const ids = result.squad.map(p => p.id);
    if (firstSquad) expect(ids).toEqual(firstSquad);
    firstSquad = ids;
    expect(result.squad.filter(p => !p.isLocked && !['LS', 'RS'].includes(p.slotPosition))
      .every(p => p.price <= 90000)).toBe(true);
    options = { ...options, currentSquad: Object.fromEntries(result.squad.map((p, i) =>
      [i, { card: p.card, isLocked: p.isLocked, isOwned: !p.isLocked || p.isOwned }])) };
  }
}, 15000);

test('two locked club links outrank a higher-meta league link; price and ID break ties', () => {
  const make = (id: string, clubId: number, metaScore: number, price = 100): GeneratedPlayer => ({
    id, name: id, playerKey: id, position: 'ST', slotPosition: 'LS', altPositions: [],
    clubId, nationId: 9, leagueId: 100, price, metaScore, isOwned: false, isLocked: false, card: {},
  });
  const locked = ['lock1', 'lock2'].map(id => ({ ...make(id, 1, 80), isLocked: true }));
  const pool = [make('z', 2, 99), make('b', 1, 80, 200), make('a', 1, 80, 200), make('c', 1, 80)];
  for (const candidates of [pool, [...pool].reverse()]) {
    expect(getDynamicCandidatesForSlot('LS', locked, candidates, 300, null).map(p => p.id))
      .toEqual(['a', 'b', 'c', 'z']);
  }
});

test('a purchased locked striker reduces the automatic striker allowance', async () => {
  const options: any = structuredClone(fixture.options);
  options.currentSquad[1].isOwned = false;
  options.currentSquad[1].card.price = 100000;
  const result = await generateOptimalSquad('4-3-1-2', fixture.candidates as any, 300000, 33, true, options);
  expect(result.success).toBe(true);
  expect(result.squad.find(p => p.slotPosition === 'LS')!.price).toBeLessThanOrEqual(50000);
  expect(result.totalCost).toBeLessThanOrEqual(300000);
});


test('exclusions remain hard constraints when pure-meta upgrades can replace a preferred anchor', async () => {
  const options: any = structuredClone(fixture.options);
  options.currentSquad[0] = { card: fixture.candidates.find(c => c.id === 22), isLocked: false, isOwned: true };
  for (const [excludedCardVersionIds, expected] of [[[], '22'], [['22'], '294'], [['22', '294'], '392']] as const) {
    const result = await generateOptimalSquad('4-3-1-2', fixture.candidates as any, 300000, 33, true,
      { ...options, excludedCardVersionIds: [...excludedCardVersionIds] });
    expect(result.success).toBe(true);
    expect(result.totalChemistry).toBe(33);
    const striker = result.squad.find(p => p.slotPosition === 'LS')!;
    const anchor = fixture.candidates.find(card => String(card.id) === expected)!;
    expect(pureMetaScore(striker, 'LS')).toBeGreaterThanOrEqual(pureMetaScore(anchor, 'LS'));
    expect(result.squad.some(p => (excludedCardVersionIds as readonly string[]).includes(p.id))).toBe(false);
  }
});


test('candidate fetching ignores unlocked owned cards as well as their pitch positions', async () => {
  const emptyDb = createCandidateMockDb([]);
  const occupiedDb = createCandidateMockDb([]);
  const options: any = structuredClone(fixture.options);
  const empty = await fetchCandidatePlayers(300000, '4-3-1-2', false, emptyDb as any, options);
  options.currentSquad[0] = { card: fixture.candidates.find(c => c.id === 22), isLocked: false, isOwned: true };
  const occupied = await fetchCandidatePlayers(300000, '4-3-1-2', false, occupiedDb as any, options);
  expect(occupied).toEqual(empty);
  expect(occupiedDb.calls).toEqual(emptyDb.calls);
});
