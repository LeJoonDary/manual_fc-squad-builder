import { expect, test, vi } from 'vitest';
import { adaptChemistryPlayerCard, normalizeChemistryPosition } from './chemistry';
import { FORMATIONS } from './formations.js';
import { calculateSquadChemistry, generateOptimalSquad, postProcessSquad, pureMetaScore, weightedTopThree, weightedTopFive } from './autoBuildUtils';

const make = (id: number, slot: string, price = 1000, stats = 70, locked = false, extras: any = {}) => {
  const card = { id, player_id: id, position: normalizeChemistryPosition(slot), overall: stats, price,
    pac: stats, sho: stats, pas: stats, dri: stats, def: stats, phy: stats,
    nation_id: 1, club_id: 1, league_id: 1, ...extras };
  return { ...adaptChemistryPlayerCard(card), card, id: String(id), playerKey: String(card.player_id),
    slotPosition: slot, price, metaScore: stats, isLocked: locked, isOwned: false };
};
const fixture = () => FORMATIONS.find(f => f.name === '4-3-1-2')!.slots.map((s, i) => make(i + 1, s.position, 0, 85, true));
const poolsFor = (squad: ReturnType<typeof fixture>) => squad.map(() => [] as ReturnType<typeof make>[]);

test('pure performance gives identical primary and alternate-position scores, including CB', () => {
  for (const [slot, primary] of [['ST', 'LW'], ['RB', 'CB'], ['CB', 'RB']]) {
    const primaryCard = make(100, slot);
    const alternateCard = make(101, slot, 1000, 70, false, { position: primary, alternate_positions: [slot] });
    expect(pureMetaScore(primaryCard, slot)).toBe(pureMetaScore(alternateCard, slot));
  }
  const role = make(102, 'RB', 1000, 70, false, { card_roles: [{ role_level: 2, roles: { position: 'RB' } }], accele_type: 'Explosive' });
  expect(pureMetaScore(role, 'RB')).toBeGreaterThan(pureMetaScore(make(103, 'RB'), 'RB'));
});

test('rescue selects the cheapest strict chemistry improvement and returns matching manager', async () => {
  const squad = fixture();
  squad[0] = make(50, squad[0].slotPosition, 1000, 70, false, { nation_id: 99, club_id: 99, league_id: 99 });
  const pools = poolsFor(squad);
  pools[0] = [make(100, squad[0].slotPosition, 80000, 99), make(101, squad[0].slotPosition, 2000, 75)];
  const snapshot = structuredClone({ squad, pools });
  const before = calculateSquadChemistry(squad, true).totalChemistry;
  const result = await postProcessSquad(squad, pools, 100000, true);
  expect(before).toBeLessThan(33);
  expect(result.squad[0].id).toBe('101');
  expect(result.totalChemistry).toBe(33);
  expect(result.manager).toEqual(calculateSquadChemistry(result.squad, true).manager);
  expect({ squad, pools }).toEqual(snapshot);
});

test('weak slots get fair upgrades; illegal, excluded and chemistry-losing alternatives are rejected', async () => {
  const squad = fixture();
  squad[0] = make(50, squad[0].slotPosition, 1000, 85);
  squad[3] = make(51, squad[3].slotPosition, 1000, 50);
  const pools = poolsFor(squad);
  pools[0] = [make(100, squad[0].slotPosition, 41000, 95)];
  const slot = squad[3].slotPosition;
  pools[3] = [make(101, slot, 41000, 80), make(102, slot, 90000, 99),
    make(103, slot, 1000, 99, false, { position: 'GK' }),
    make(104, slot, 1000, 99),
    make(105, slot, 1000, 99, false, { nation_id: 99, club_id: 99, league_id: 99 }),
    make(106, slot, 1000, 99, false, { player_id: squad[1].playerKey })];
  const result = await postProcessSquad(squad, pools, 102000, true, 33, { excludedCardVersionIds: [104] }, Infinity, () => 0);
  expect(result.squad[3].id).toBe('101');
  // Weak CM consumes 40k first; the stronger ST cannot spend 40k of the remaining 60k.
  expect(result.squad[0].id).toBe('50');
  expect(result.totalChemistry).toBe(33);
  expect(result.remainingBudget).toBe(60000);
  expect(result.squad.filter(p => p.isLocked)).toEqual(squad.filter(p => p.isLocked));
});

test('eligible alternates compete even after the main deadline expires; zero remaining budget is respected', async () => {
  const squad = fixture();
  squad[0] = make(50, squad[0].slotPosition, 1000, 70);
  const pools = poolsFor(squad);
  pools[0] = [make(100, squad[0].slotPosition, 2000, 90, false, { position: 'LW', alternate_positions: ['ST'] })];
  const result = await postProcessSquad(squad, pools, 3000, true);
  expect(result.squad[0].id).toBe('100');
  expect((await postProcessSquad(squad, pools, 1000, true)).squad).toEqual(squad);
  expect((await postProcessSquad(squad, pools, 3000, true, 33, {}, -Infinity)).squad[0].id).toBe('100');
});

test('top-three weighted sampling uses proportional intervals and never selects fourth', () => {
  const ranked = [90, 60, 30, 20];
  expect(weightedTopThree(ranked, n => n, () => 0)).toBe(90);
  expect(weightedTopThree(ranked, n => n, () => .6)).toBe(60);
  expect(weightedTopThree(ranked, n => n, () => .99)).toBe(30);
});

test('optimizer still runs after an unsuccessful rescue, can save money, and never sacrifices chemistry', async () => {
  const squad = fixture();
  const foreign = { nation_id: 99, club_id: 99, league_id: 99 };
  squad[0] = make(50, squad[0].slotPosition, 10000, 70, false, foreign);
  const pools = poolsFor(squad);
  pools[0] = [make(100, squad[0].slotPosition, 5000, 90, false, foreign)];
  const before = calculateSquadChemistry(squad, true).totalChemistry;
  const result = await postProcessSquad(squad, pools, 20000, true);
  expect(before).toBeLessThan(33);
  expect(result.squad[0].id).toBe('100');
  expect(result.totalChemistry).toBe(before);
  expect(result.remainingBudget).toBe(15000);
});

test('post-processing preserves explicit tactical requirements and special/female limits', async () => {
  const squad = fixture();
  const slot = squad[0].slotPosition;
  squad[0] = make(50, slot, 1000, 70, false, { wf: 5 });
  const pools = poolsFor(squad);
  pools[0] = [make(100, slot, 1000, 90, false, { wf: 3 }),
    make(101, slot, 1000, 90, false, { wf: 5, gender: 'female' }),
    make(102, slot, 1000, 90, false, { wf: 5, isIcon: true })];
  const result = await postProcessSquad(squad, pools, 5000, true, 33,
    { slotRequirements: { [slot]: { minWf: 5 } }, maxFemalePlayers: 'exclude', maxSpecialCards: 0 });
  expect(result.squad).toEqual(squad);
});

test('target 32 still rescues to 33 using an alternate from a different slot pool', async () => {
  const squad = fixture();
  const slot = squad[0].slotPosition;
  squad[0] = make(50, slot, 1000, 90, false, { nation_id: 99, club_id: 99, league_id: 99 });
  const pools = poolsFor(squad);
  pools[8] = [make(100, 'LW', 1000, 70, false, { alternate_positions: ['ST'] })];
  const result = await postProcessSquad(squad, pools, 11000, true, 32, {}, -Infinity);
  expect(result.totalChemistry).toBe(33);
  expect(result.squad[0].id).toBe('100');
  expect(result.squad[0].slotPosition).toBe(slot);
});

test('atomic two-slot rescue crosses a 32-chemistry plateau without exposing intermediate swaps', async () => {
  const keys = [[3,1,2],[3,1,2],[2,1,2],[2,1,1],[3,2,3],[2,1,2],[2,1,2],[1,1,3],[1,1,1],[1,1,3],[1,1,2]];
  const squad = keys.map(([nation_id, league_id, club_id], i) => make(i, 'CM', 1000, 80, i < 9, { nation_id, league_id, club_id }));
  const a = make(20, 'CM', 1000, 80, false, { nation_id: 3, league_id: 1, club_id: 2 });
  const b = make(21, 'CM', 1000, 80, false, { nation_id: 3, league_id: 2, club_id: 2 });
  const chem = (players: typeof squad) => calculateSquadChemistry(players, false).totalChemistry;
  expect(chem(squad)).toBe(32);
  expect(chem([...squad.slice(0, 9), a, squad[10]])).toBe(32);
  expect(chem([...squad.slice(0, 10), b])).toBe(32);
  const pools = poolsFor(squad); pools[9] = [a]; pools[10] = [b];
  const snapshot = structuredClone(squad);
  const result = await postProcessSquad(squad, pools, 11000, false, 32);
  expect(result.totalChemistry).toBe(33);
  expect(result.squad.slice(9).map(p => p.id).sort()).toEqual(['20', '21']);
  expect(squad).toEqual(snapshot);
});

test('top-five sampling uses improvements, reaches fifth, and excludes non-improvements', () => {
  const ranked = [90, 85, 84, 83, 82, 81];
  expect(weightedTopFive(ranked, n => n, 80, () => .4)).toBe(90); // 10 / 24 rather than 90 / 424
  expect(weightedTopFive(ranked, n => n, 80, () => .99)).toBe(82);
  expect(weightedTopFive([80, 79], n => n, 80)).toBeUndefined();
});

test('main-search jitter changes equally strong initial selections without changing performance scores', async () => {
  const squad = fixture();
  const currentSquad = Object.fromEntries(squad.slice(1).map(p => [p.slotPosition, { card: p.card, isLocked: true, isOwned: true }]));
  const cards = [make(100, squad[0].slotPosition, 1000, 90).card, make(101, squad[0].slotPosition, 1000, 90).card];
  const ids: string[] = [];
  for (const draws of [[.01, .99], [.99, .01]]) {
    let i = 0;
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => draws[i++ % draws.length]);
    try {
      const result = await generateOptimalSquad('4-3-1-2', { FW: cards, MF: [], DF: [] } as any, 10000, 33, true, { currentSquad });
      expect(result.success).toBe(true);
      expect(result.totalChemistry).toBe(33);
      ids.push(result.squad[0].id);
      expect(pureMetaScore(result.squad[0], result.squad[0].slotPosition)).toBe(pureMetaScore(cards[0], squad[0].slotPosition));
    } finally { spy.mockRestore(); }
  }
  expect(new Set(ids).size).toBe(2);
});

test('rescue time exhaustion does not consume the optimizer time or evaluation allowance', async () => {
  const keys = [[3,1,2],[3,1,2],[2,1,2],[2,1,1],[3,2,3],[2,1,2],[2,1,2],[1,1,3],[1,1,1],[1,1,3],[1,1,2]];
  const squad = keys.map(([nation_id, league_id, club_id], i) => make(i, 'CM', 1000, 80, i !== 9, { nation_id, league_id, club_id }));
  const pools = poolsFor(squad);
  pools[9] = Array.from({ length: 200 }, (_, i) => make(100 + i, 'CM', 1000, 90, false,
    { nation_id: 1, league_id: 1, club_id: 3 }));
  let ticks = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => ++ticks < 50 ? 0 : 2000);
  try {
    const result = await postProcessSquad(squad, pools, 20000, false, 32, {}, -Infinity, () => 0);
    expect(result.squad[9].id).not.toBe('9');
    expect(result.totalChemistry).toBe(32);
    expect(pureMetaScore(result.squad[9], 'CM')).toBeGreaterThan(pureMetaScore(squad[9], 'CM'));
  } finally { clock.mockRestore(); }
});

test('optimizer scans beyond five high-meta neutral upgrades for 33 chemistry and never drops it again', async () => {
  const keys = [[3,1,2],[3,1,2],[2,1,2],[2,1,1],[3,2,3],[2,1,2],[2,1,2],[1,1,3],[1,1,1],[1,1,3],[1,1,2]];
  const squad = keys.map(([nation_id, league_id, club_id], i) => make(i, 'CM', 1000, 80, i !== 0, { nation_id, league_id, club_id }));
  const pools = poolsFor(squad);
  pools[0] = Array.from({ length: 200 }, (_, i) => make(100 + i, 'CM', 1000, 95, false,
    { nation_id: 3, league_id: 1, club_id: 2 }));
  pools[0].push(make(999, 'CM', 1100, 85, false, { nation_id: 1, league_id: 1, club_id: 3 }));
  let ticks = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => ++ticks < 50 ? 0 : 2000);
  try {
    // Target 32 disables final rescue; only Stage 2 can select the 33-chemistry card here.
    const result = await postProcessSquad(squad, pools, 20000, false, 32, {}, -Infinity, () => 0);
    expect(result.totalChemistry).toBe(33);
    expect(result.squad[0].id).toBe('999');
  } finally { clock.mockRestore(); }
});
