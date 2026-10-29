import { expect, test, vi } from 'vitest';
import { calculateSquadChemistry, generateOptimalSquad, getDynamicCandidatesForSlot, type GeneratedPlayer } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';

const card = (id: number, position: string, extra = {}) => ({
  id, player_id: id, position, overall: 90, price: 1000,
  pac: 90, sho: 90, pas: 90, dri: 90, def: 90, phy: 90,
  nationId: 'France', leagueId: 'A', clubId: 'club', ...extra,
});
const prepared = (id: number, extra = {}): GeneratedPlayer => {
  const raw = card(id, 'CM', extra);
  return { ...raw, id: String(id), name: String(id), card: raw, slotPosition: 'CM',
    playerKey: String(id), metaScore: 90, isOwned: false, isLocked: false, ...extra };
};

test('dispersed locked nations prefer an established club without removing nation candidates', () => {
  const squad = ['Canada', 'Germany', 'Spain', 'Portugal'].map((nationId, i) =>
    prepared(i, { nationId, clubId: i < 2 ? 'Bayern' : 'Barcelona', isLocked: true }));
  const nationLink = prepared(100, { nationId: 'Canada', clubId: 'other', meta_score: 99 });
  const clubBridge = prepared(101, { nationId: 'Brazil', clubId: 'Bayern' });
  const pool = [nationLink, clubBridge];
  const before = structuredClone(pool);
  const result = getDynamicCandidatesForSlot('CM', squad, pool, Infinity);
  expect(result.map(p => p.id)).toEqual(['101', '100']);
  expect(pool).toEqual(before);
});

test('four locks accept a completed XI whose real manager closes the gap', async () => {
  const slots = FORMATIONS.find(f => f.name === '4-3-1-2')!.slots;
  const cards = slots.map((s, i) => card(i, s.position, {
    nationId: i < 7 ? 'France' : i < 10 ? 'Germany' : 'Spain',
    leagueId: i < 7 ? 'A' : 'B', clubId: i < 7 ? 'clubA' : i < 10 ? 'clubB' : 'other',
  }));
  const lockedIndices = new Set([0, 1, 2, 7]);
  const currentSquad = cards.map((p, i) => lockedIndices.has(i)
    ? { card: p, isLocked: true, isOwned: true } : null);
  const pool = cards.filter((_, i) => !lockedIndices.has(i));
  const before = structuredClone(pool);
  const result = await generateOptimalSquad('4-3-1-2', { FW: pool, MF: [], DF: [] }, 0, 33, true, { currentSquad });
  expect(result.success).toBe(true);
  expect(result.squad).toHaveLength(11);
  expect(calculateSquadChemistry(result.squad, false).totalChemistry).toBe(31);
  expect(result.manager?.addedChemistry).toBe(2);
  expect(result.totalChemistry).toBe(33);
  expect(result.stageAttempts.slice(1)).toEqual([0, 0, 0]);
  expect(pool).toEqual(before);
});

test('two-slot anchors preserve budget for later stages while the iteration guard still bounds search', async () => {
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
  try {
    const slots = FORMATIONS.find(f => f.name === '4-3-1-2')!.slots;
    const currentSquad = slots.map((s, i) => ['LS', 'RS', 'CAM'].includes(s.position)
      ? { card: card(100 + i, s.position), isLocked: true, isOwned: true } : null);
    const pool = Array.from({ length: 25 }, (_, i) => card(i, 'CM'));
    const before = structuredClone(pool);
    const result = await generateOptimalSquad('4-3-1-2', { FW: [], MF: pool, DF: [] }, 0, 33, false, { currentSquad });
    expect(result.searchLimitReached).toBe(true);
    expect(result.searchStage).toBeGreaterThan(1);
    expect(result.squad.length).toBeGreaterThan(3);
    expect(result.success).toBe(false);
    expect(result.stageAttempts.slice(1).some(attempts => attempts > 0)).toBe(true);
    expect(pool).toEqual(before);
  } finally {
    clock.mockRestore();
  }
}, 15000);
