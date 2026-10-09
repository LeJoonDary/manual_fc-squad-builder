import { expect, test } from 'vitest';
import { calculatePlayerStrength, calculateFinalSquadScore, generateOptimalSquad, calculateSquadChemistry } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';

test('strength uses OVR and normalized pace aliases, including low-rated Gold', () => {
  expect(calculatePlayerStrength({ overall: 82, facePace: 99, version: 'Gold' })).toBe(172.5);
  expect(calculatePlayerStrength({ overall: 82, player_stats: [{ pac: 99 }] })).toBe(172.5);
  expect(calculatePlayerStrength({ overall: 82, attributeSprintSpeed: 99 })).toBe(172.5);
  expect(calculatePlayerStrength({})).toBe(155);
});
test('final scoring uses exact hybrid and club bonuses, no Gold floor, and rejects excess cost', () => {
  const squad = Array.from({ length: 11 }, (_, i) => ({ overall: 82, facePace: 90, version: 'Gold',
    nationId: i, leagueId: i < 4 ? 1 : i < 8 ? 2 : 3, clubId: i < 2 ? 1 : i + 2, price: 1000, assignedPosition: 'ST' }));
  expect(calculateFinalSquadScore(squad, 33, 11000)).toBe(11 * 168 + 500 + 150 + 40);
  expect(calculateFinalSquadScore(squad, 32, 11000)).toBe(320);
  expect(calculateFinalSquadScore(squad, 33, 10000)).toBe(-Infinity);
  expect(calculateFinalSquadScore(squad.map(p => ({ ...p, nationId: 1 })), 33)).toBe(11 * 168 + 500 + 150 + 40 - 300);
});
test('complete-squad search matches exhaustive scoring on a small pool and ignores input order', async () => {
  const slots = FORMATIONS.find(f => f.name === '4-3-3')!.slots;
  const make = (id, position, overall, pace) => ({ id, player_id: id, position, overall,
    facePace: pace, price: 1000, nationId: id, leagueId: id % 3, clubId: 1, version: 'Gold' });
  const fixed = Object.fromEntries(slots.filter(s => !['LW', 'ST'].includes(s.position)).map((slot, i) => [slot.position,
    { card: make(i + 1, slot.position, 85, 80), isOwned: true, isLocked: true }]));
  const rows = [make(100, 'LW', 82, 99), make(101, 'LW', 85, 70), make(200, 'ST', 90, 90), make(201, 'ST', 88, 98)];
  const results = [];
  for (const lw of rows.slice(0, 2)) for (const st of rows.slice(2)) {
    results.push(await generateOptimalSquad('4-3-3', { FW: [lw, st], MF: [], DF: [] }, 1000000, 33, true, { currentSquad: fixed }));
  }
  for (const input of [rows, [...rows].reverse()]) {
    const result = await generateOptimalSquad('4-3-3', { FW: input, MF: [], DF: [] }, 1000000, 33, true, { currentSquad: fixed });
    expect(result.success).toBe(true);
    expect(result.finalScore).toBe(Math.max(...results.map(r => r.finalScore)));
    expect(result.squad.find(p => p.slotPosition === 'LW')?.card.overall).toBe(82);
    expect(calculateSquadChemistry(result.squad, true).totalChemistry).toBe(33);
    expect(result.squad.filter(p => p.isLocked)).toHaveLength(9);
  }
});
