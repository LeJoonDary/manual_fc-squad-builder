import * as chemistry from './chemistry';
import { expect, test, vi } from 'vitest';
import { calculateSquadChemistry, repairNearMissSquad, type GeneratedPlayer } from './autoBuildUtils';

// Prepared-pool fixture: real chemistry calculator, three locks and a 1M budget.
const make = (id: number, group: number, extra = {}): GeneratedPlayer => {
  const card = { id: String(id), position: 'CM', overall: 90, price: 50000,
    nationId: group, leagueId: group, clubId: group, ...extra };
  return { ...card, card, slotPosition: 'CM', playerKey: String(id), metaScore: 90,
    isLocked: false, isOwned: false, ...extra } as GeneratedPlayer;
};
const fixture = () => Array.from({ length: 11 }, (_, i) =>
  make(i, i < 4 ? 1 : i < 8 ? 2 : 3, { isLocked: [0, 1, 4].includes(i) }));
const poolsFor = () => Array.from({ length: 11 }, () => [] as GeneratedPlayer[]);

test('repairs 32/33 with three locks under 1M and chooses the highest successful meta score', async () => {
  const squad = fixture();
  squad[7] = make(7, 2, { clubId: 99 });
  const pools = poolsFor();
  pools[7] = [make(100, 2), { ...make(101, 2), metaScore: 95 }];
  const before = structuredClone({ squad, pools });
  expect(squad.filter(p => p.isLocked)).toHaveLength(3);
  expect(calculateSquadChemistry(squad, false).totalChemistry).toBe(32);
  const result = await repairNearMissSquad(squad, pools, 1000000, false);
  expect(result?.[7].id).toBe('101');
  expect(calculateSquadChemistry(result!, false).totalChemistry).toBe(33);
  expect(result!.reduce((sum, p) => sum + p.price, 0)).toBeLessThanOrEqual(1000000);
  expect(result!.filter(p => p.isLocked)).toEqual(squad.filter(p => p.isLocked));
  expect({ squad, pools }).toEqual(before);
});

test('repairs two slots only when both change, using the combined released budget', async () => {
  const squad = fixture();
  squad[6] = make(6, 2, { clubId: 98 });
  squad[7] = make(7, 2, { clubId: 99 });
  const pools = poolsFor();
  pools[6] = [make(100, 2, { price: 90000 })];
  pools[7] = [make(101, 2, { price: 10000 })];
  expect(calculateSquadChemistry(squad, false).totalChemistry).toBe(31);
  const result = await repairNearMissSquad(squad, pools, 550000, false);
  expect(result?.slice(6, 8).map(p => p.id)).toEqual(['100', '101']);
  expect(calculateSquadChemistry(result!, false).totalChemistry).toBe(33);
  expect(result!.reduce((sum, p) => sum + p.price, 0)).toBe(550000);
});

test('rejects duplicate players, overspending, gender and special limits without touching locks', async () => {
  const squad = fixture();
  squad[7] = make(7, 2, { clubId: 99 });
  const pools = poolsFor();
  pools[0] = [make(900, 2)];
  pools[7] = [{ ...make(100, 2), playerKey: squad[4].playerKey },
    make(101, 2, { price: 600000 }), make(102, 2, { gender: 'female' }),
    make(103, 2, { isIcon: true }), make(104, 2, { isHero: true })];
  expect(await repairNearMissSquad(squad, pools, 1000000, false, 33,
    { maxFemalePlayers: 'exclude', maxSpecialCards: 0 })).toBeNull();
});

test('leaves successful, incomplete and unrepairable squads untouched', async () => {
  const squad = fixture();
  expect(await repairNearMissSquad(squad, poolsFor(), 1000000, false)).toBeNull();
  expect(await repairNearMissSquad(squad.slice(1), poolsFor(), 1000000, false)).toBeNull();
  squad[7] = make(7, 2, { clubId: 99 });
  expect(await repairNearMissSquad(squad, poolsFor(), 1000000, false)).toBeNull();
});


test('stops after 1500 trial evaluations even when every slot has many legal replacements', async () => {
  const evaluate = vi.fn(() => ({ totalChemistry: 0, playerChemistry: 0 }));
  const spy = vi.spyOn(chemistry, 'prepareChemistryDelta').mockReturnValue(evaluate);
  try {
    const squad = Array.from({ length: 11 }, (_, i) => make(i, i + 1));
    const pools = squad.map((_, i) => Array.from({ length: 60 }, (_, j) => make(1000 + i * 60 + j, i + 1)));
    expect(await repairNearMissSquad(squad, pools, 1000000, false)).toBeNull();
    expect(evaluate).toHaveBeenCalledTimes(1501); // Initial squad plus 1500 trials.
  } finally { spy.mockRestore(); }
});

test('checks the deadline during candidate filtering before evaluating more trials', async () => {
  let elapsed = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => elapsed += 500);
  const evaluate = vi.fn(() => ({ totalChemistry: 0, playerChemistry: 0 }));
  const spy = vi.spyOn(chemistry, 'prepareChemistryDelta').mockReturnValue(evaluate);
  try {
    const squad = Array.from({ length: 11 }, (_, i) => make(i, i + 1));
    const pools = squad.map((_, i) => Array.from({ length: 60 }, (_, j) => make(1000 + i * 60 + j, i + 1)));
    expect(await repairNearMissSquad(squad, pools, 1000000, false)).toBeNull();
    expect(evaluate).toHaveBeenCalledTimes(1);
  } finally { clock.mockRestore(); spy.mockRestore(); }
});


test('fast delta checks retain a repair that needs a manager to reach the target', async () => {
  const squad = fixture();
  squad[7] = make(7, 99);
  const pools = poolsFor();
  pools[7] = [make(101, 2, { clubId: 99, nationId: 99 })];
  expect(calculateSquadChemistry(squad, true).totalChemistry).toBeLessThan(33);
  const result = await repairNearMissSquad(squad, pools, 1000000, true);
  expect(result).not.toBeNull();
  expect(calculateSquadChemistry(result!, false).totalChemistry).toBeLessThan(33);
  expect(calculateSquadChemistry(result!, true).totalChemistry).toBe(33);
});
