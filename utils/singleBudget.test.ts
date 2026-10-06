import { describe, expect, it } from 'vitest';
import { calculateMetaPaceScore, generateOptimalSquad, getFocusWeight, getSlotEvaluationOrder, getPositionBudgetGroup, type CandidateGroups } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';

const slots = FORMATIONS.find(item => item.name === '4-3-3')!.slots;
const positions = ['LW', 'ST', 'RW', 'CM', 'CM', 'CM', 'LB', 'CB', 'CB', 'RB', 'GK'];
function card(id: number, position: string, price: number, score: number) {
  return { id, player_id: id, position, overall: score, price,
    nationId: 1, leagueId: 1 + id % 3, clubId: 1,
    player_stats: { pac: score, sho: score, pas: score, dri: score, def: score, phy: score,
      composure: score, finishing: score, agility: score, balance: score } };
}
function grouped(rows: ReturnType<typeof card>[]): CandidateGroups {
  const result: CandidateGroups = { FW: [], MF: [], DF: [] };
  for (const row of rows) result[getPositionBudgetGroup(row.position, false)].push(row);
  return result;
}

describe('single shared budget', () => {
  it('normalizes slot aliases and gives ST first priority in attack and balanced', () => {
    const input = ['GK', 'RCM', 'LW', 'LCB', 'ST', 'RB', 'CDM', 'CAM'];
    expect(getSlotEvaluationOrder('attack', input)).toEqual(['ST', 'CAM', 'LW', 'LCB', 'RCM', 'CDM', 'RB', 'GK']);
    expect(getSlotEvaluationOrder('balanced', input)).toEqual(['ST', 'LCB', 'RCM', 'CDM', 'CAM', 'LW', 'RB', 'GK']);
    expect(getSlotEvaluationOrder('defense', input)).toEqual(['LCB', 'CDM', 'RCM', 'ST', 'RB', 'CAM', 'LW', 'GK']);
    expect(input[0]).toBe('GK');
  });

  it('caps unlocked fullback/GK purchases at fixed ceilings throughout upgrades, without capping CB', async () => {
    const rows = positions.map((position, i) => card(i + 1, position, 1000, 80));
    for (const [i, position] of ['LB', 'RB', 'GK'].entries()) {
      const cap = 40000;
      rows.push(card(100 + i, position, cap, 90), card(200 + i, position, cap + 1, 99));
    }
    rows.push(card(300, 'CB', 80000, 95));
    const result = await generateOptimalSquad('4-3-3', grouped(rows), 500000, 30, false);
    expect(result.success).toBe(true);
    expect(result.squad.filter(p => ['LB', 'RB', 'GK'].includes(p.slotPosition)).map(p => p.price)).toEqual([40000, 40000, 40000]);
    expect(result.squad.some(p => p.id === '300')).toBe(true);
    expect(result.totalCost).toBeLessThanOrEqual(500000);
  });

  it('keeps expensive locked and owned defenders despite their market prices', async () => {
    const rows = positions.map((position, i) => card(i + 1, position, 1000, 80));
    const currentSquad = {
      LB: { card: card(100, 'LB', 80000, 95), isLocked: true },
      GK: { card: card(101, 'GK', 160000, 99), isOwned: true },
    };
    const result = await generateOptimalSquad('4-3-3', grouped(rows), 500000, 30, false, { currentSquad });
    expect(result.success).toBe(true);
    expect(result.squad.find(p => p.slotPosition === 'LB')).toMatchObject({ id: '100', price: 80000, isLocked: true });
    expect(result.squad.find(p => p.slotPosition === 'GK')).toMatchObject({ id: '101', price: 0, isOwned: true });
  });

  it('reports failure instead of exceeding the fixed cap when only luxury fullbacks exist', async () => {
    const rows = positions.map((position, i) => card(i + 1, position, ['LB', 'RB'].includes(position) ? 80000 : 1000, 80));
    const result = await generateOptimalSquad('4-3-3', grouped(rows), 500000, 30, false);
    expect(result.success).toBe(false);
    expect(result.status).toBe('incomplete');
    expect(result.squad.some(p => ['LB', 'RB'].includes(p.slotPosition))).toBe(false);
  });
  it.each(['attack', 'balanced', 'defense'] as const)('applies the intended position-specific score multipliers: %s', async focus => {
    const rows = positions.map((position, i) => card(i + 1, position, 1000, 80));
    const result = await generateOptimalSquad('4-3-3', grouped(rows), 20000, 30, false, { focus });
    expect(result.success).toBe(true);
    for (const player of result.squad) expect(player.metaScore).toBeCloseTo(
      calculateMetaPaceScore(player.card, player.slotPosition) * getFocusWeight(player.slotPosition, focus));
    expect(getFocusWeight('CDM', focus)).toBe(focus === 'defense' ? 1.2 : 1);
    expect(getFocusWeight('LCB', focus)).toBe(focus === 'defense' ? 1.3 : 1);
    expect(getFocusWeight('ST', focus)).toBe(focus === 'attack' ? 1.3 : 1);
    expect(getFocusWeight('GK', focus)).toBe(1);
  });

  it('allows a card far above the former equal-share cap and keeps paid locks exact', async () => {
    const rows = positions.map((position, i) => card(i + 1, position, 700, 80));
    rows.push(card(100, 'ST', 350000, 99));
    const currentSquad = { GK: { card: { ...rows[10], price: 50000 }, isLocked: true } };
    const before = structuredClone(currentSquad);
    const result = await generateOptimalSquad('4-3-3', grouped(rows), 1000000, 30, false, { currentSquad });
    expect(result.success).toBe(true);
    expect(result.squad.find(p => p.id === '100')?.price).toBe(350000);
    expect(result.squad.find(p => p.slotPosition === 'GK')).toMatchObject({ id: '11', price: 50000, isLocked: true });
    expect(result.totalCost).toBeLessThanOrEqual(1000000);
    expect(currentSquad).toEqual(before);
  });

  it.each([49999, 300000])('performs at most two upgrades only when at least 50k remains: %s', async budget => {
    const rows = positions.map((position, i) => card(i + 1, position, 650, 50));
    const open = ['ST', 'LCM', 'LCB'];
    const currentSquad = Object.fromEntries(slots.filter(slot => !open.includes(slot.position))
      .map(slot => [slot.position, { card: rows[slots.indexOf(slot)], isLocked: true, isOwned: true }]));
    // Conflicting high-meta versions exhaust the first DFS, yielding a cheap complete seed.
    rows.push(...Array.from({ length: 400 }, (_, i) => ({ ...card(1000 + i, 'ST', 1000, 99), player_id: 11 })));
    rows.push(card(2000, 'ST', 10000, 95), card(2001, 'CM', 10000, 95), card(2002, 'CB', 10000, 95));
    const result = await generateOptimalSquad('4-3-3', grouped(rows), budget, 30, false, { currentSquad });
    expect(result.success).toBe(true);
    expect(result.iterations).toBeGreaterThan(350);
    expect(result.squad.filter(p => Number(p.id) >= 2000)).toHaveLength(budget === 49999 ? 0 : 2);
    expect(result.totalChemistry).toBeGreaterThanOrEqual(30);
    expect(result.totalCost).toBeLessThanOrEqual(budget);
    expect(result.squad.filter(p => p.isLocked)).toHaveLength(8);
  });
});

it.each([0, 400000])('preserves both wing investments after reserving paid locks: %s', async lockedCost => {
  const rows = positions.map((position, i) => card(i + 1, position, 650, 70));
  const currentSquad = Object.fromEntries(slots.filter(slot => !['ST', 'LW', 'RW'].includes(slot.position))
    .map(slot => [slot.position, { card: { ...rows[slots.indexOf(slot)], price: slot.position === 'GK' ? lockedCost : 0 },
      isLocked: true, isOwned: slot.position !== 'GK' }]));
  rows.push(card(100, 'ST', 350000, 98), card(101, 'ST', 595001, 99), card(102, 'ST', 150000, 90),
    card(110, 'LW', 200000, 95), card(111, 'LW', 400000, 99),
    card(120, 'RW', 200000, 95), card(121, 'RW', 340001, 99));
  for (const input of [rows, [...rows].reverse()]) {
    const result = await generateOptimalSquad('4-3-3', grouped(input), 1000000, 30, false, { focus: 'attack', currentSquad });
    expect(result.success).toBe(true);
    expect(result.squad.find(p => p.slotPosition === 'ST')?.price).toBe(lockedCost ? 150000 : 350000);
    expect(result.squad.filter(p => ['LW', 'RW'].includes(p.slotPosition)).map(p => p.price)).toEqual([200000, 200000]);
    expect(result.totalCost).toBeLessThanOrEqual(1000000);
    expect(result.totalChemistry).toBeGreaterThanOrEqual(30);
    expect(result.squad.filter(p => p.isLocked)).toHaveLength(8);
  }
});

it('spends both upgrade opportunities on cheap CBs before a weaker CM', async () => {
  const rows = positions.map((position, i) => ({ ...card(i + 1, position, 650, position === 'CM' ? 40 : 50), overall: 80 }));
  const currentSquad = Object.fromEntries(slots.filter(slot => !['ST', 'LCM', 'LCB', 'RCB'].includes(slot.position))
    .map(slot => [slot.position, { card: rows[slots.indexOf(slot)], isLocked: true, isOwned: true }]));
  rows.push(...Array.from({ length: 400 }, (_, i) => ({ ...card(1000 + i, 'ST', 1000, 99), player_id: 11 })));
  rows.push(card(2000, 'CM', 30000, 99), card(2001, 'CB', 30000, 95), card(2002, 'CB', 30000, 94));
  const result = await generateOptimalSquad('4-3-3', grouped(rows), 300000, 30, false, { currentSquad });
  expect(result.success).toBe(true);
  expect(result.squad.filter(p => ['LCB', 'RCB'].includes(p.slotPosition)).map(p => p.id).sort()).toEqual(['2001', '2002']);
  expect(result.squad.some(p => p.id === '2000')).toBe(false);
  expect(result.totalChemistry).toBeGreaterThanOrEqual(30);
  expect(result.totalCost).toBeLessThanOrEqual(300000);
  expect(result.squad.filter(p => p.isLocked)).toHaveLength(7);
});

it.each([['attack', 80000, '201'], ['attack', 79999, '200'], ['balanced', 80000, '200']] as const)(
  'uses the premium CB preference only with sufficient balance in %s (%s)', async (focus, remaining, expected) => {
    const currentSquad = Object.fromEntries(slots.filter(slot => slot.position !== 'LCB').map((slot, i) =>
      [slot.position, { card: card(i + 1, slot.position, slot.position === 'GK' ? 1000000 - remaining : 0, 80),
        isLocked: true, isOwned: slot.position !== 'GK' }]));
    const rows = [card(200, 'CB', 2400, 85), card(201, 'CB', 40000, 80),
      card(202, 'CB', 35000, 60)];
    const result = await generateOptimalSquad('4-3-3', grouped(rows), 1000000, 30, false, { focus, currentSquad });
    expect(result.success).toBe(true);
    expect(result.squad.find(p => p.slotPosition === 'LCB')?.id).toBe(expected);
    expect(result.totalCost).toBeLessThanOrEqual(1000000);
    expect(result.totalChemistry).toBeGreaterThanOrEqual(30);
    expect(result.squad.filter(p => p.isLocked)).toHaveLength(10);
  });

it('selects a striker above the old cap but rejects prices above 170% of the base', async () => {
  const currentSquad = Object.fromEntries(slots.filter(slot => slot.position !== 'ST')
    .map((slot, i) => [slot.position, { card: card(i + 1, slot.position, 0, 80), isLocked: true, isOwned: true }]));
  const rows = [card(200, 'ST', 350000, 85), card(201, 'ST', 595000, 95), card(202, 'ST', 595001, 99)];
  const result = await generateOptimalSquad('4-3-3', grouped(rows), 1000000, 30, false, { currentSquad });
  expect(result.success).toBe(true);
  expect(result.squad.find(p => p.slotPosition === 'ST')?.id).toBe('201');
  expect(result.totalCost).toBe(595000);
  expect(result.squad.filter(p => p.isLocked)).toHaveLength(10);
});

it.each([false, true])('applies role preferences and strict filtering in every solver path: %s', async isStrictRoleMode => {
  const currentSquad = Object.fromEntries(slots.filter(slot => slot.position !== 'ST')
    .map((slot, i) => [slot.position, { card: card(i + 1, slot.position, 0, 80), isLocked: true, isOwned: true }]));
  const rows = [
    { ...card(200, 'ST', 10000, 85), roles: [{ position: 'ST', name: 'Poacher', level: 1 }] },
    { ...card(201, 'ST', 10000, 85), card_roles: [{ role_level: 2, roles: { position: 'ST', role_name: 'Poacher' } }] },
    card(202, 'ST', 10000, 86),
  ];
  const options = { currentSquad, isStrictRoleMode, slotRoleRequirements: { ST: { roleName: 'Poacher', minLevel: 1 as const } } };
  const result = await generateOptimalSquad('4-3-3', grouped(rows), 1000000, 30, false, options);
  expect(result.success).toBe(true);
  expect(result.squad.find(p => p.slotPosition === 'ST')?.id).toBe('200');
  const impossible = await generateOptimalSquad('4-3-3', grouped(rows.filter(p => p.id !== 201)), 1000000, 30, false,
    { ...options, isStrictRoleMode: true, slotRoleRequirements: { ST: { roleName: 'Poacher', minLevel: 2 } } });
  expect(impossible.success).toBe(false);
  expect(impossible.squad.some(p => p.slotPosition === 'ST')).toBe(false);
  await expect(generateOptimalSquad('4-3-3', grouped(rows), 1000000, 30, false, { ...options, isStrictRoleMode: true,
    currentSquad: { ...currentSquad, ST: { card: rows[2], isLocked: true, isOwned: true } } })).rejects.toThrow('locked player');
});

it.each(['attack', 'balanced', 'defense'] as const)('selects a specialist CM and mobile RB in %s', async focus => {
  const currentSquad = Object.fromEntries(slots.filter(slot => !['LCM', 'RB'].includes(slot.position))
    .map((slot, i) => [slot.position, { card: card(i + 1, slot.position, 0, 80), isLocked: true, isOwned: true }]));
  const rows = [
    { ...card(200, 'RW', 1000, 86), altPositions: ['CM'], player_stats: { pac: 74, sho: 79, pas: 85, dri: 91, def: 41, phy: 67 } },
    { ...card(201, 'CDM', 850, 84), altPositions: ['CM'], player_stats: { pac: 64, sho: 56, pas: 78, dri: 78, def: 83, phy: 78 } },
    { ...card(202, 'CM', 10000, 84), player_stats: { pac: 78, sho: 74, pas: 83, dri: 80, def: 78, phy: 80 } },
    { ...card(203, 'RB', 700, 81), player_stats: { pac: 71, sho: 50, pas: 71, dri: 73, def: 81, phy: 80 } },
    { ...card(204, 'RB', 10000, 82), player_stats: { pac: 83, sho: 55, pas: 75, dri: 76, def: 76, phy: 75 } },
  ];
  // Alternate-position attacker belongs in the CM pool so it is genuinely evaluated.
  const groups = grouped(rows);
  groups.MF.push(rows[0]);
  const result = await generateOptimalSquad('4-3-3', groups, 1000000, 30, false, { focus, currentSquad });
  expect(result.success).toBe(true);
  expect(result.squad.find(p => p.slotPosition === 'LCM')?.id).toBe('202');
  expect(result.squad.find(p => p.slotPosition === 'RB')?.id).toBe('204');
  expect(result.totalChemistry).toBeGreaterThanOrEqual(30);
  expect(result.totalCost).toBeLessThanOrEqual(1000000);
  expect(result.squad.filter(p => p.isLocked)).toHaveLength(9);
});

it.each(['attack', 'balanced', 'defense'] as const)('caps premium CB by focus in %s', async focus => {
  const ceiling = focus === 'attack' ? 200000 : focus === 'defense' ? 450000 : 300000;
  const currentSquad = Object.fromEntries(slots.filter(slot => slot.position !== 'LCB')
    .map((slot, i) => [slot.position, { card: card(i + 1, slot.position, 0, 80), isLocked: true, isOwned: true }]));
  const result = await generateOptimalSquad('4-3-3', grouped([
    card(200, 'CB', ceiling, 95), card(201, 'CB', ceiling + 1, 99), card(202, 'CB', 620000, 99),
  ]), 1000000, 30, false, { focus, currentSquad });
  expect(result.success).toBe(true);
  expect(result.squad.find(p => p.slotPosition === 'LCB')?.id).toBe('200');
  expect(result.totalCost).toBe(ceiling);
});

it('never relaxes combined tactical requirements for cheaper or higher scoring candidates', async () => {
  const currentSquad = Object.fromEntries(slots.filter(slot => slot.position !== 'ST')
    .map((slot, i) => [slot.position, { card: card(i + 1, slot.position, 0, 80), isLocked: true, isOwned: true }]));
  const good = { ...card(200, 'ST', 10000, 84), roles: [{ name: 'Poacher', level: 2 }], playstyles_plus: ['Rapid'] };
  const wrong = { ...card(201, 'ST', 650, 99), roles: [{ name: 'Poacher', level: 2 }], playstyles: ['Rapid'] };
  const options = { currentSquad, slotRequirements: { ST: {
    role: { name: 'Poacher', minLevel: 1 as const }, playstyle: { idOrName: 'Rapid', isPlus: true },
  } } };
  const result = await generateOptimalSquad('4-3-3', grouped([good, wrong]), 1000000, 30, false, options);
  expect(result.success).toBe(true);
  expect(result.squad.find(p => p.slotPosition === 'ST')?.id).toBe('200');
  const impossible = await generateOptimalSquad('4-3-3', grouped([wrong]), 1000000, 30, false, options);
  expect(impossible.success).toBe(false);
  expect(impossible.squad.some(p => p.slotPosition === 'ST')).toBe(false);
  await expect(generateOptimalSquad('4-3-3', grouped([good]), 1000000, 30, false, {
    ...options, currentSquad: { ...currentSquad, ST: { card: wrong, isLocked: true, isOwned: true } },
  })).rejects.toThrow('tactical requirements');
});
