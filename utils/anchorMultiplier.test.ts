import { expect, test } from 'vitest';
import { FORMATIONS } from './formations.js';
import { calculateMetaScore, evaluateCandidateScore, getPriorityPriceCap, passesNewCandidateFilter,
  fetchCandidatePlayers, generateOptimalSquad, fitsAnchorBudgetCaps } from './autoBuildUtils';
import { createCandidateMockDb, mockCandidate } from '../scripts/mocks/candidateDb.js';

test('first three anchors expand to 52.5%, 32.5%, 22% and later slots share remaining funds', () => {
  const priorities = ['ST','CAM','WING','MID','CB','FB','GK'];
  for (const [step, pos, expected] of [[0,'ST',525000],[1,'CAM',325000],[2,'LW',220000]] as const) {
    expect(getPriorityPriceCap(pos, 1000000, priorities, undefined, { anchorStepIndex: step })).toBe(expected);
  }
  expect(getPriorityPriceCap('CM', 1000000, priorities, undefined,
    { anchorStepIndex: 3, remainingBudget: 100000, remainingSlotsCount: 4 })).toBe(32500);
  expect(getPriorityPriceCap('CM', 1000000, priorities, undefined,
    { anchorStepIndex: 3, remainingBudget: 900000, remainingSlotsCount: 4 })).toBe(160000);
  expect(Number.isInteger(getPriorityPriceCap('CM', 300000, priorities, undefined,
    { anchorStepIndex: 3, remainingBudget: 123456.7, remainingSlotsCount: 7 }))).toBe(true);
});

test.each(['LB','RB','LWB','RWB'])('%s uses physicality 20%, no passing, and PHY 65 only from 500k', pos => {
  const card = { overall: 80, pac: 90, def: 70, phy: 60, pas: 0, price: 1000 };
  expect(calculateMetaScore(card, pos)).toBeCloseTo(77.5);
  expect(calculateMetaScore({ ...card, pas: 99 }, pos)).toBeCloseTo(77.5);
  expect(calculateMetaScore({ ...card, phy: 70 }, pos)).toBeCloseTo(79.5);
  for (const budget of [0, 200000, 499999, 500000, 1000000]) for (const phy of [62,64,65]) {
    for (const stats of [{ phy }, { facePhysicality: phy }, { player_stats: [{ phy }] }]) {
      expect(passesNewCandidateFilter({ pac: 82, price: 1000, ...stats }, pos, budget)).toBe(budget < 500000 || phy >= 65);
      expect(passesNewCandidateFilter({ pac: 81, price: 1000, ...stats }, pos, budget)).toBe(false);
    }
  }
});

test('striker weights are budget independent and support raw and normalized face stats', () => {
  const card = { overall: 90, pac: 90, sho: 90, pas: 90, dri: 90, phy: 90 };
  expect(calculateMetaScore(card, 'ST', 499999)).toBeCloseTo(90);
  expect(calculateMetaScore(card, 'CF', 500000)).toBeCloseTo(90);
  expect(evaluateCandidateScore(card, 'ST', [], 500000)).toBeCloseTo(90);
  expect(calculateMetaScore({ overall: 90, facePace: 90, faceShooting: 90, facePassing: 90, faceDribbling: 90, facePhysicality: 90 }, 'ST', 500000)).toBeCloseTo(90);
  expect(passesNewCandidateFilter({ pac: 70, price: 1000 }, 'CB', 1000000)).toBe(true);
});

test('DB query retains expanded anchor cards and integer price caps', async () => {
  const db = createCandidateMockDb([mockCandidate(999, ['ST'], 500000, 95)]);
  const result = await fetchCandidatePlayers(1000000, '4-3-3 (4)', false, db as any);
  expect(result.some(p => p.id === 999)).toBe(true);
  expect(db.calls.find(c => c.positions.includes('ST')).max).toBe(525000);
  expect(db.calls.find(c => c.positions.includes('CAM')).max).toBe(325000);
  for (const call of db.calls) expect(Number.isInteger(call.max)).toBe(true);
});

test('high-performance 500k striker is eligible as the first open anchor, without a price floor', async () => {
  const slots = FORMATIONS.find(f => f.name === '4-3-3')!.slots;
  const make = (id, position, overall, price) => ({ id, player_id: id, position, overall, price,
    pac: 90, sho: overall, dri: overall, phy: 80, def: 80, nationId: 1, leagueId: 100, clubId: 1 });
  const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'ST').map((s, i) =>
    [s.position, { card: { ...make(i, s.position, 85, 1000), isIcon: true }, isLocked: true, isOwned: true }]));
  const result = await generateOptimalSquad('4-3-3', { FW: [{ ...make(102, 'ST', 99, 750), pac: 62 }, make(100, 'ST', 85, 750), make(101, 'ST', 95, 500000)], MF: [], DF: [] },
    1000000, 33, false, { currentSquad });
  expect(result.success).toBe(true);
  expect(result.squad.find(p => p.slotPosition === 'ST')?.id).toBe('101');
  expect(fitsAnchorBudgetCaps(result.squad, 1000000)).toBe(true);
  const cheapBest = await generateOptimalSquad('4-3-3', { FW: [make(100, 'ST', 99, 750), make(101, 'ST', 95, 500000)], MF: [], DF: [] },
    1000000, 33, false, { currentSquad });
  expect(cheapBest.squad.find(p => p.slotPosition === 'ST')?.id).toBe('100');
});

test('full-squad cap recheck catches a late slot exceeding its remaining-budget share', () => {
  const positions = ['ST','CAM','LW','CM','CB','LB','GK'];
  const squad = positions.map((slotPosition, i) => ({ slotPosition, price: [500000,300000,100000,50000,10000,10000,10000][i], isLocked: false }));
  expect(fitsAnchorBudgetCaps(squad as any, 1000000)).toBe(false);
  squad[3].price = 30000;
  expect(fitsAnchorBudgetCaps(squad as any, 1000000)).toBe(true);
});

// All acquisition paths use this filter, including replacements and fallback passes.
test.each(['ST', 'CF', 'LS', 'RS'])('%s enforces pace 82 at every budget and retains physicality cutoffs', pos => {
  for (const budget of [0, 200000, 300000, 499999, 500000, 1000000]) {
    for (const pace of [62, 81, 82]) for (const phy of [65, 66, 69, 70]) {
      for (const stats of [{ pace }, { pac: pace }, { facePace: pace, pac: 99 }, { player_stats: [{ pac: pace }] }]) {
        const card = { price: 1000, phy, ...stats };
        for (const input of [card, { card }, { raw: card }]) {
          expect(passesNewCandidateFilter(input, pos, budget)).toBe(pace >= 82 && phy >= (budget >= 500000 ? 70 : 66));
        }
      }
    }
  }
});
