import { expect, test } from 'vitest';
import { FORMATIONS } from './formations.js';
import { normalizeChemistryPosition } from './chemistry';
import { calculateMetaScore, fetchCandidatePlayers, generateOptimalSquad, getDynamicCandidatesForSlot,
  getPositionBudgetGroup, calculateDynamicSlotCap, buildDynamicFillOrder, passesNewCandidateFilter } from './autoBuildUtils';
import { createCandidateMockDb } from '../scripts/mocks/candidateDb.js';

const positions = FORMATIONS.find(f => f.name === '4-3-1-2')!.slots.map(s => s.position);
test('fixed spine preserves every formation slot, with midfield before defenders', () => {
  expect(buildDynamicFillOrder(positions.map(position => ({ position }))).map(s => s.position))
    .toEqual(['LS', 'RS', 'CAM', 'LCM', 'CM', 'RCM', 'LCB', 'RCB', 'LB', 'RB', 'GK']);
  expect(buildDynamicFillOrder(['GK', 'CB', 'CM', 'LW', 'CAM', 'ST'].map(position => ({ position }))).map(s => s.position))
    .toEqual(['ST', 'CAM', 'LW', 'CM', 'CB', 'GK']);
});

test.each(['ST','CF','LS','RS'])('striker %s needs physicality 70 from 500k', pos => {
  for (const phy of [69, 70]) for (const value of [{ phy }, { facePhysicality: phy }, { player_stats: [{ phy }] }, { face_stats: { phy } }]) {
    const card = { price: 1000, pac: 90, ...value };
    for (const input of [card, { card }, { raw: card }]) {
      expect(passesNewCandidateFilter(input, pos, 500000)).toBe(phy >= 70);
      expect(passesNewCandidateFilter(input, pos, 499999)).toBe(true);
    }
  }
  expect(passesNewCandidateFilter({ price: 1000, pac: 90 }, pos, 500000)).toBe(false);
});

test('primary and alternate positions receive identical scores in the assigned slot', () => {
  const base = { pac: 90, phy: 80, position: 'CAM', altPositions: ['ST'] };
  expect(calculateMetaScore({ ...base, position: 'ST' }, 'LS') - calculateMetaScore(base, 'LS')).toBe(0);
  const joined = { ...base, card_positions: [{ is_primary: true, positions: { name: 'ST' } }] };
  expect(calculateMetaScore({ card: joined }, 'RS') - calculateMetaScore(base, 'RS')).toBe(0);
});

test('candidate query uses compressed caps and the largest open repeated-slot cap', async () => {
  const db = createCandidateMockDb([]);
  await fetchCandidatePlayers(1000000, '4-3-1-2', false, db as any);
  expect(db.calls.find(c => c.positions.includes('CM')).max).toBe(1000000);
  expect(db.calls.find(c => c.positions.includes('CB')).max).toBe(1000000);
  const locked = { LS: { card: { id: 1, price: 1000 }, isLocked: true, isOwned: true } };
  const second = createCandidateMockDb([]);
  await fetchCandidatePlayers(1000000, '4-3-1-2', false, second as any, { currentSquad: locked });
  expect(second.calls.find(c => c.positions.includes('ST')).max).toBe(1000000);
});

test('dynamic pool retains 25 base candidates', () => {
  const pool = Array.from({ length: 110 }, (_, i) => ({ id: String(i), playerKey: String(i), price: 1000, metaScore: 110 - i }));
  expect(getDynamicCandidatesForSlot('ST', [], pool as any, 100000)).toHaveLength(25);
});

test('wingless 4-3-1-2 builds 33 chemistry with physical strikers and all per-slot caps intact', async () => {
  const groups = { FW: [], MF: [], DF: [] } as Record<string, any[]>;
  positions.forEach((slot, i) => {
    const card = { id: i, player_id: i, position: normalizeChemistryPosition(slot), overall: 85,
      facePace: 90, phy: 80, def: 80, price: 40000, nationId: i % 3 + 1, leagueId: 100 + i % 3, clubId: i % 3 + 1 };
    groups[getPositionBudgetGroup(slot, false)].push(card);
    if (['LS','RS'].includes(slot)) groups.FW.push({ ...card, id: 100 + i, player_id: 100 + i, overall: 99, wf: 5, sm: 5, phy: 69 });
  });
  const result = await generateOptimalSquad('4-3-1-2', groups, 1000000, 33, true);
  expect(result.success).toBe(true);
  expect(result.totalChemistry).toBe(33);
  expect(result.squad).toHaveLength(11);
  for (const player of result.squad) {
    expect(player.price).toBeLessThanOrEqual(calculateDynamicSlotCap(player.slotPosition, positions, 1000000, false, 1000000, positions));
    expect(Number(player.id)).toBeLessThan(100);
  }
});

test('second striker becomes the first open anchor with locked teammates', async () => {
  const make = (id: number, position: string, overall: number, price: number) => ({ id, player_id: id,
    position: normalizeChemistryPosition(position), overall, price, pac: 90, phy: 70, def: 70,
    nationId: 1, leagueId: 100, clubId: 1 });
  const currentSquad = Object.fromEntries(positions.filter(p => p !== 'RS').map((pos, i) => [pos,
    { card: { ...make(i, pos, 85, 1000), isIcon: true, pac: 60, phy: 60 }, isLocked: true, isOwned: true }]));
  const result = await generateOptimalSquad('4-3-1-2', { FW: [make(100, 'ST', 85, 100000),
    make(101, 'ST', 90, 525000), make(102, 'ST', 99, 525001)], MF: [], DF: [] },
    1000000, 33, false, { currentSquad });
  expect(result.success).toBe(true);
  expect(result.totalChemistry).toBe(33);
  expect(result.squad.find(p => p.slotPosition === 'RS')?.id).toBe('100');
  expect(result.squad.filter(p => p.isLocked)).toHaveLength(10);
});
