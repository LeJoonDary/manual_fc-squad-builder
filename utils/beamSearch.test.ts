import { expect, test } from 'vitest';
import { generateOptimalSquad, isNewSelectionValid, passesNewCandidateFilter, calculateFinalSquadScore, getPositionBudgetGroup, calculatePlayerStrength, selectionSynergyBonus, getAnchorSlotOrder, anchorSynergyScore, isActiveLeagueCandidate, getDynamicCandidatesForSlot, isStrictSelectionValid, isRelaxedSelectionValid, evaluateCandidateScore } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';

test('strict 5-5-4 quotas exempt locks, count Icon nations and count Hero leagues', () => {
  const locks = Array.from({ length: 3 }, () => ({ nationId: 1, leagueId: 1, clubId: 1, isIcon: true, isLocked: true }));
  const five = Array.from({ length: 5 }, (_, i) => ({ nationId: 1, leagueId: 1, clubId: i < 4 ? 1 : 2 }));
  expect(isNewSelectionValid([...locks, ...five])).toBe(true);
  expect(isNewSelectionValid([...locks, ...five, { nation_id: '1', isIcon: true }])).toBe(false);
  expect(isNewSelectionValid([...five, { leagueId: '1', isHero: true }])).toBe(false);
  expect(isNewSelectionValid([...five, { clubId: '1' }])).toBe(false);
  expect(isNewSelectionValid([...five, { clubId: 1, leagueId: 1, isIcon: true }])).toBe(true);
  expect(isNewSelectionValid(Array.from({ length: 5 }, (_, i) => ({ club: { name: i % 2 ? 'Arsenal Women' : 'Arsenal' } })))).toBe(false);
});

test('CB/GK eligibility uses women leagues and flags, never height or missing data', () => {
  for (const position of ['LCB', 'RCB', 'GK']) {
    for (const height of [undefined, null, 0, 170, 180, 186]) {
      expect(passesNewCandidateFilter({ height, league_id: 100 }, position, 500000)).toBe(true);
    }
    expect(passesNewCandidateFilter({ league_id: '1' }, position, 0)).toBe(false);
    expect(passesNewCandidateFilter({ league: { id: 2215 } }, position, 0)).toBe(false);
    expect(passesNewCandidateFilter({ raw: { league_id: 6 } }, position, 0)).toBe(false);
    expect(passesNewCandidateFilter({ isWomen: true }, position, 0)).toBe(false);
  }
  expect(passesNewCandidateFilter({ league_id: 1, isWomen: true }, 'ST', 0)).toBe(true);
  expect(passesNewCandidateFilter({}, 'GK', 500000)).toBe(true);
});

const slots = FORMATIONS.find(f => f.name === '4-3-3')!.slots;
const make = (id: number, position: string, i: number) => ({ id, player_id: id, position,
  overall: 85, def: 80, facePace: 90, height: 190, price: 1000,
  nationId: i % 3, leagueId: 100 + i % 3, clubId: i % 3 });

test('bounded search builds 33 chemistry under 500ms from 1320 candidates', async () => {
  const groups = { FW: [], MF: [], DF: [] } as Record<string, any[]>;
  slots.forEach((slot, i) => {
    for (let j = 0; j < 120; j++) groups[getPositionBudgetGroup(slot.position, false)].push({ ...make(i * 120 + j, slot.position, i), facePace: 99 - j });
  });
  const start = performance.now();
  const result = await generateOptimalSquad('4-3-3', groups, 500000, 33, true);
  const elapsed = performance.now() - start;
  console.log(`Beam search: ${elapsed.toFixed(1)}ms, ${result.iterations} expansions`);
  expect(result.success).toBe(true);
  expect(isNewSelectionValid(result.squad)).toBe(true);
  expect(result.iterations).toBeLessThanOrEqual(11 * 40 * 35);
  expect(elapsed).toBeLessThan(500);
});

test('locked Icons permit five new same-nation picks and physical-invalid locks survive', async () => {
  const currentSquad = Object.fromEntries(slots.slice(0, 6).map((slot, i) => [slot.position,
    { card: { ...make(i, slot.position, 1), isIcon: true, height: 160, isWomen: true }, isLocked: true, isOwned: true }]));
  const groups = { FW: [], MF: [], DF: [] } as Record<string, any[]>;
  slots.slice(6).forEach((slot, i) => groups[getPositionBudgetGroup(slot.position, false)].push({ ...make(100 + i, slot.position, i), nationId: 1 }));
  const result = await generateOptimalSquad('4-3-3', groups, 500000, 33, false, { currentSquad });
  expect(result.success).toBe(true);
  expect(result.squad.filter(p => !p.isLocked)).toHaveLength(5);
  expect(result.squad.filter(p => p.isLocked)).toHaveLength(6);
});

test('infeasible mono-nation pool never relaxes quotas', async () => {
  const groups = { FW: [], MF: [], DF: [] } as Record<string, any[]>;
  slots.forEach((slot, i) => groups[getPositionBudgetGroup(slot.position, false)].push({ ...make(i, slot.position, i), nationId: 1 }));
  const result = await generateOptimalSquad('4-3-3', groups, 500000, 0, false);
  expect(result.status).toBe('incomplete');
  expect(isNewSelectionValid(result.squad)).toBe(true);
});

test('final score uses balanced OVR/pace and constant GK pace', () => {
  const squad = slots.map((slot, i) => make(i, slot.position, i));
  expect(calculateFinalSquadScore(squad, 33)).toBe(10912.75);
  expect(calculateFinalSquadScore(squad, 32)).toBe(-16800);
  expect(calculateFinalSquadScore(squad.map(p => ({ ...p, price: 2000 })), 33)).toBe(calculateFinalSquadScore(squad, 33));
});


test.each([['LCM', 69, -130], ['RCM', 70, 120], ['CDM', 74, -180], ['CDM', 75, 120], ['CAM', 0, 120], ['LW', 0, 120]])(
  'assigned %s enforces DEF %s scoring', (position, def, score) => {
    expect(calculatePlayerStrength({ facePace: 100, stats: { def }, overall: 99 }, String(position))).toBe(score);
  });

test('OVR never increases strength; joined defending and pace aliases work', () => {
  expect(calculatePlayerStrength({ overall: 99, facePace: 80 }, 'ST')).toBe(calculatePlayerStrength({ overall: 82, facePace: 80 }, 'ST'));
  expect(calculatePlayerStrength({ player_stats: [{ pac: 80, def: 75 }] }, 'CDM')).toBe(96);
  expect(calculatePlayerStrength({ attributeSprintSpeed: 80, faceDefending: 70 }, 'CM')).toBe(96);
});

test('synergy adds 40 only once and supports locks and numeric/string IDs', () => {
  expect(selectionSynergyBonus({ nationId: 1, leagueId: 2, clubId: 3 } as any, [{ nationId: '1', leagueId: 2, clubId: 3 } as any])).toBe(40);
  expect(selectionSynergyBonus({} as any, [{} as any])).toBe(0);
});

test('lower OVR defensive CM wins over fast high OVR winger assigned to CM', async () => {
  const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'LCM').map((slot, i) => [slot.position,
    { card: { ...make(i, slot.position, 1), isIcon: true }, isLocked: true, isOwned: true }]));
  const winger = { ...make(100, 'LW', 1), altPositions: ['CM'], overall: 99, facePace: 99, def: 60 };
  const midfielder = { ...make(101, 'CM', 1), overall: 82, facePace: 80, def: 70 };
  const result = await generateOptimalSquad('4-3-3', { FW: [], MF: [winger, midfielder], DF: [] }, 500000, 33, false, { currentSquad });
  expect(result.success).toBe(true);
  expect(result.squad.find(p => p.slotPosition === 'LCM')?.id).toBe('101');
});

test('chemistry partner below the old top ten remains selectable', async () => {
  const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'ST').map((slot, i) => [slot.position,
    { card: make(i, slot.position, 1), isLocked: true, isOwned: true }]));
  const isolated = Array.from({ length: 24 }, (_, i) => ({ ...make(100 + i, 'ST', 2), facePace: 99 }));
  const partner = { ...make(200, 'ST', 1), facePace: 85 };
  const result = await generateOptimalSquad('4-3-3', { FW: [...isolated, partner], MF: [], DF: [] }, 500000, 33, false, { currentSquad });
  expect(result.success).toBe(true);
  expect(result.squad.find(p => p.slotPosition === 'ST')?.id).toBe('200');
});


test('6-5 leagues, six nations and a five-player club are legal, seventh/sixth are not', () => {
  const squad = Array.from({ length: 11 }, (_, i) => ({ nationId: i < 6 ? 1 : 2, leagueId: i < 6 ? 1 : 2, clubId: i < 5 ? 1 : i < 9 ? 2 : 3 }));
  expect(isStrictSelectionValid(squad)).toBe(false);
  expect(isRelaxedSelectionValid(squad)).toBe(true);
  expect(isRelaxedSelectionValid([...squad, { nationId: 1 }])).toBe(false);
  expect(isRelaxedSelectionValid([...squad, { clubId: 1 }])).toBe(false);
});

test('GK priority permits spending up to the first-priority 35 percent cap', async () => {
  const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'GK').map((slot, i) => [slot.position,
    { card: make(i, slot.position, 1), isLocked: true, isOwned: true }]));
  const cheap = { ...make(100, 'GK', 2), overall: 85, price: 1000 };
  const keeper = { ...make(101, 'GK', 1), overall: 90, price: 175000 };
  const result = await generateOptimalSquad('4-3-3', { FW: [], MF: [], DF: [cheap, keeper] }, 500000, 33, false, { currentSquad, keyPositions: ['GK'] });
  expect(result.success).toBe(true);
  expect(result.squad.find(p => p.slotPosition === 'GK')?.id).toBe('101');
  expect(result.totalCost).toBe(175000);
  expect(result.squad.filter(p => p.isLocked)).toHaveLength(10);
});


test('complete lower-chemistry squad is retained for diagnostics but rejected by the gate', async () => {
  const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'ST').map((slot, i) => [slot.position,
    { card: make(i, slot.position, 1), isLocked: true, isOwned: true }]));
  const result = await generateOptimalSquad('4-3-3', { FW: [make(100, 'ST', 2)], MF: [], DF: [] }, 500000, 33, false, { currentSquad });
  expect(result.success).toBe(false);
  expect(result.status).toBe('chemistry_unmet');
  expect(result.squad).toHaveLength(11);
  expect(result.totalChemistry).toBe(30);
});

test('scarce GK pool never restores a blocked female keeper', async () => {
  const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'GK').map((slot, i) => [slot.position,
    { card: make(i, slot.position, 1), isLocked: true, isOwned: true }]));
  const keeper = { ...make(100, 'GK', 1), height: 175, isWomen: true };
  const result = await generateOptimalSquad('4-3-3', { FW: [], MF: [], DF: [keeper] }, 500000, 33, false, { currentSquad });
  expect(result.success).toBe(false);
  expect(result.squad.some(p => p.id === '100')).toBe(false);
  expect(result.squad.filter(p => p.isLocked)).toHaveLength(10);
});

test('ST anchor reserves its budget before selecting an affordable winger', async () => {
  const currentSquad = Object.fromEntries(slots.filter(s => !['LW', 'ST'].includes(s.position)).map((slot, i) => [slot.position,
    { card: make(i, slot.position, 1), isLocked: true, isOwned: true }]));
  const expensive = Array.from({ length: 35 }, (_, i) => ({ ...make(100 + i, 'LW', 1), price: 6000, facePace: 99 }));
  const cheap = { ...make(200, 'LW', 1), price: 1000, facePace: 85 };
  const striker = { ...make(201, 'ST', 1), price: 6000 };
  const result = await generateOptimalSquad('4-3-3', { FW: [...expensive, cheap, striker], MF: [], DF: [] }, 10000, 33, false, { currentSquad });
  expect(result.success).toBe(true);
  expect(result.squad.some(p => p.id === '200')).toBe(true);
});


test('heightless goalkeeper completes 33 chemistry without cheap replacement build', async () => {
  const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'GK').map((slot, i) => [slot.position,
    { card: make(i, slot.position, 1), isLocked: true, isOwned: true }]));
  const keeper = { ...make(100, 'GK', 1), height: undefined, overall: 90, price: 40000 };
  const isolated = { ...make(101, 'GK', 2), height: undefined, overall: 82, facePace: 70, price: 700 };
  const result = await generateOptimalSquad('4-3-3', { FW: [], MF: [], DF: [isolated, keeper] }, 500000, 33, false, { currentSquad });
  expect(result.success).toBe(true);
  expect(result.totalChemistry).toBe(33);
  expect(result.squad.find(p => p.slotPosition === 'GK')?.id).toBe('100');
  expect(result.totalCost).toBe(40000);
});


test('anchor order preserves every formation slot, with attackers first and GK last', () => {
  expect(getAnchorSlotOrder(['GK', 'RB', 'RCB', 'LCB', 'LB', 'RCM', 'LCM', 'RM', 'LM', 'CAM', 'ST']))
    .toEqual(['ST', 'CAM', 'RM', 'LM', 'RCB', 'LCB', 'RCM', 'LCM', 'RB', 'LB', 'GK']);
  for (const formation of FORMATIONS) {
    const positions = formation.slots.map(s => s.position);
    const order = getAnchorSlotOrder(positions);
    expect([...order].sort()).toEqual([...positions].sort());
    expect(order.at(-1)).toBe('GK');
  }
});

test('anchor synergy rewards thresholds rather than each teammate', () => {
  const card = { clubId: 1, leagueId: 100, nationId: 2 } as any;
  expect(anchorSynergyScore(card, [card, { clubId: 3, leagueId: '100', nationId: '2' } as any])).toBe(145);
  expect(anchorSynergyScore({} as any, [{} as any])).toBe(0);
});

test('fourth real league is blocked even for Hero and same-nation bridges', () => {
  const squad = [100, 101, 102].map((leagueId, i) => ({ leagueId, nationId: i })) as any;
  expect(isActiveLeagueCandidate({ leagueId: 103, nationId: 99 } as any, squad)).toBe(false);
  expect(isActiveLeagueCandidate({ leagueId: '100', nationId: 99 } as any, squad)).toBe(true);
  expect(isActiveLeagueCandidate({ leagueId: 103, nationId: '0' } as any, squad)).toBe(false);
  expect(isActiveLeagueCandidate({ leagueId: 103, isIcon: true } as any, squad)).toBe(true);
  expect(isActiveLeagueCandidate({ leagueId: 103, isHero: true } as any, squad)).toBe(false);
});

test('dynamic synergy promotes a partner beyond the old static top thirty', () => {
  const prepared = (id, leagueId, metaScore) => ({ id: String(id), playerKey: String(id), leagueId,
    nationId: id, clubId: id, price: 1000, metaScore, card: { overall: 85 } });
  const anchor = prepared(1, 100, 90);
  const pool = Array.from({ length: 60 }, (_, i) => prepared(100 + i, 200, 99));
  const partner = { ...prepared(200, 100, 80), clubId: anchor.clubId };
  expect(getDynamicCandidatesForSlot('ST', [anchor] as any, [...pool, partner] as any, 5000)[0].id).toBe('200');
  expect(getDynamicCandidatesForSlot('ST', [anchor] as any, [...pool, partner] as any, 5000)).toHaveLength(50);
});


test.each([[0,0],[1,140],[2,25],[3,60],[4,15],[5,0]])('diminishing synergy with %s existing identical affiliations', (count, expected) => {
  const card = { clubId: 1, leagueId: 100, nationId: 1 } as any;
  expect(anchorSynergyScore(card, Array.from({ length: count }, () => card))).toBe(expected);
});

test.each([[2999,-40],[3000,0],[14999,0],[15000,50],[250000,50],[250001,50]])('million-coin card bonus boundary %s', (price, bonus) => {
  expect(evaluateCandidateScore({ overall: 90, facePace: 90, price }, 'ST', [], 1000000)).toBe(78 + bonus);
});

test('budget bonus excludes Icons and low budgets; GK pace is fixed', () => {
  expect(evaluateCandidateScore({ overall: 90, facePace: 90, price: 700, isIcon: true }, 'ST', [], 1000000)).toBe(78);
  expect(evaluateCandidateScore({ overall: 90, facePace: 90, price: 700 }, 'ST', [], 499999)).toBe(78);
  expect(evaluateCandidateScore({ overall: 90, facePace: 99, price: 20000 }, 'GK', [], 1000000)).toBe(185);
});

test.each([[.7499,0],[.75,250],[.95,250],[.9501,250]])('spending bonus at %s utilization', (ratio, bonus) => {
  const squad = slots.map((slot, i) => ({ ...make(i, slot.position, i), price: Math.floor(1000000 * ratio / 11) + (i === 0 ? Math.round(1000000 * ratio) % 11 : 0) }));
  const base = squad.reduce((sum, p) => sum + evaluateCandidateScore(p, p.position, [], 1000000), 10000);
  expect(calculateFinalSquadScore(squad, 33, 1000000)).toBeCloseTo(base + bonus);
});

test('premium candidates beat equivalent 750-coin cards at high budget', async () => {
  const groups = { FW: [], MF: [], DF: [] } as Record<string, any[]>;
  slots.forEach((slot, i) => groups[getPositionBudgetGroup(slot.position, false)].push(
    { ...make(i, slot.position, i), price: 750 }, { ...make(100+i, slot.position, i), price: 70000 }));
  const result = await generateOptimalSquad('4-3-3', groups, 1000000, 33, true);
  expect(result.success).toBe(true);
  expect(result.totalChemistry).toBe(33);
  expect(isStrictSelectionValid(result.squad)).toBe(true);
  expect(result.totalCost).toBe(770000);
});


test('only a strict 32-chemistry baseline can use a one-slot relaxed rescue', async () => {
  const affiliations = [[1,100,1],[2,102,2],[0,101,3],[2,102,0],[1,100,1],[0,102,2],[0,100,3],[1,100,0],[1,102,1],[2,102,2],[1,100,3]];
  const rows = slots.map((slot, i) => ({ ...make(i, slot.position, i),
    nationId: affiliations[i][0], leagueId: affiliations[i][1], clubId: affiliations[i][2] }));
  const group = cards => {
    const result = { FW: [], MF: [], DF: [] } as Record<string, any[]>;
    for (const c of cards) result[getPositionBudgetGroup(c.position, false)].push(c);
    return result;
  };
  const original = await generateOptimalSquad('4-3-3', group(rows), 1000000, 33, true);
  expect(original.totalChemistry).toBe(32);
  expect(isStrictSelectionValid(original.squad)).toBe(true);
  const rescue = { ...rows[2], id: 100, player_id: 100, leagueId: 100, clubId: 0 };
  const result = await generateOptimalSquad('4-3-3', group([...rows, rescue]), 1000000, 33, true);
  expect(result.totalChemistry).toBe(33);
  expect(isStrictSelectionValid(result.squad)).toBe(false);
  expect(isRelaxedSelectionValid(result.squad)).toBe(true);
  expect(result.squad.filter(p => !original.squad.some(q => p.id === q.id))).toHaveLength(1);
  expect(result.squad.find(p => p.id === '100')?.slotPosition).toBe('RW');
  const lowChemRows = rows.map((p, i) => i === 2 ? { ...p, nationId: 999, clubId: 999 } : p);
  const withoutManager = await generateOptimalSquad('4-3-3', group([...lowChemRows, rescue]), 1000000, 33, false);
  expect(withoutManager.totalChemistry).toBeLessThan(31);
  expect(isStrictSelectionValid(withoutManager.squad)).toBe(true);
  expect(withoutManager.squad.some(p => p.id === '100')).toBe(false);
});


test('equal-priority aliases retain formation order and CB precedes midfield', () => {
 expect(getAnchorSlotOrder(['GK','LWB','LB','CDM','LCM','RCB','LCB','RWB','RB','CF','ST','LW','LM','RW','RM','CAM','UNKNOWN']))
  .toEqual(['CF','ST','CAM','LW','LM','RW','RM','RCB','LCB','CDM','LCM','LWB','LB','RWB','RB','GK','UNKNOWN']);
});
