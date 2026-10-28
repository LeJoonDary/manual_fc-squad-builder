import { expect, test } from 'vitest';
import { calculateSquadChemistry, fitsAnchorBudgetCaps, generateOptimalSquad, getAvailableCardPositions, getDynamicCandidatesForSlot, getChemistryDeficits, getNormalizedSlot, getNormalizedSquadArray, isActiveLeagueCandidate, getEffectiveCoreLeague } from './autoBuildUtils';
import { isPositionMatched, normalizeChemistryPosition } from './chemistry';
import { FORMATIONS } from './formations.js';

const card = (id: number, position: string, extra = {}) => ({ id, player_id: id, position,
  overall: 90, pac: 90, sho: 90, pas: 90, dri: 90, def: 90, phy: 90,
  price: 1000, nationId: 'Spain', leagueId: 'Arkema', clubId: 'club', ...extra });

test.each([1, 2])('allows a 320k alternative ST with %i unlocked slots and 350k left', async count => {
  const slots = FORMATIONS.find(f => f.name === '4-3-1-2')!.slots;
  const striker = slots.find(s => ['ST', 'LS', 'LST'].includes(s.position))!.position;
  const open = count === 1 ? [striker] : [striker, 'GK'];
  const currentSquad = Object.fromEntries(slots.filter(s => !open.includes(s.position)).map((s, i) =>
    [s.position, { card: card(i, s.position), isLocked: true, isOwned: true }]));
  const salma = card(100, 'LW', { price: 320000, altPositions: ['ST'],
    card_positions: [{ is_primary: true, positions: { name: 'LW' } }] });
  const before = structuredClone(currentSquad);
  // A group label must not hide a legal alternative position.
  const result = await generateOptimalSquad('4-3-1-2', { FW: [], MF: [salma], DF: [card(200, 'GK')] },
    350000, 33, false, { currentSquad });
  expect(result.success).toBe(true);
  expect(result.totalChemistry).toBe(33);
  expect(result.squad.find(p => p.slotPosition === striker)?.id).toBe('100');
  expect(result.totalCost).toBeLessThanOrEqual(350000);
  expect(result.iterations).toBeLessThanOrEqual(count === 1 ? 20 : 400);
  expect(result.stageAttempts.slice(1)).toEqual([0, 0, 0]);
  expect(fitsAnchorBudgetCaps(result.squad, 350000)).toBe(true);
  expect(currentSquad).toEqual(before);
  const overBudget = await generateOptimalSquad('4-3-1-2', { FW: [salma], MF: [], DF: [card(200, 'GK')] },
    319999, 33, false, { currentSquad });
  expect(overBudget.success).toBe(false);
});

test('unions primary, joined and alternative positions without adding unsupported slots', () => {
  expect(getAvailableCardPositions({ position: 'LW', alt_positions: '["ST"]',
    card_positions: [{ positions: { name: 'LM' } }] }).sort()).toEqual(['LM', 'LW', 'ST']);
});

test.each(['LS', 'RS', 'LST', 'RST', 'CF'])('%s matches an alternative ST', slot => {
  expect(getNormalizedSlot(` ${slot.toLowerCase()} `)).toBe('ST');
  expect(normalizeChemistryPosition(slot)).toBe('ST');
  expect(isPositionMatched(slot, card(100, 'LW', { altPositions: ['ST'] }))).toBe(true);
});

test('uses original locks when temporary candidates lose isLocked, including the second cap filter', () => {
  const squad = Array.from({ length: 10 }, (_, i) => ({ ...card(i, 'CM', {
    leagueId: String(i % 3), nationId: String(i % 3), clubId: String(i % 4) }),
    id: String(i), playerKey: String(i), slotPosition: 'CM', metaScore: 90 }));
  const currentSquad = Object.fromEntries(squad.map(p => [p.id, { card: p, isLocked: true }]));
  const salma = { ...card(100, 'LW', { price: 320000, altPositions: ['ST'], leagueId: '0' }),
    id: '100', playerKey: '100', slotPosition: 'LS', metaScore: 90 };
  const find = (remaining: number, options = {}) => getDynamicCandidatesForSlot('LS', squad, [salma],
    100000, null, 25, null, true, 33, options, [salma], remaining, 350000);
  expect(find(350000, { currentSquad }).map(p => p.id)).toEqual(['100']);
  expect(find(319999, { currentSquad })).toEqual([]);
  expect(find(350000)).toEqual([]);
});

test('optimizes the manager for a single remaining LS slot to reach 33 chemistry', async () => {
  const slots = FORMATIONS.find(f => f.name === '4-3-1-2')!.slots;
  const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'LS').map((s, i) =>
    [s.position, { card: card(i, s.position, { nationId: i === 0 ? 'Spain' : 'France',
      leagueId: i < 7 ? 'A' : 'B' }), isLocked: true, isOwned: true }]));
  const salma = card(100, 'LW', { price: 320000, altPositions: ['ST'], leagueId: 'B', clubId: 'other' });
  const result = await generateOptimalSquad('4-3-1-2', { FW: [salma], MF: [], DF: [] },
    350000, 33, true, { currentSquad });
  expect(result.success).toBe(true);
  expect(result.totalChemistry).toBe(33);
  expect(result.manager).not.toBeNull();
  expect(calculateSquadChemistry(result.squad, false).totalChemistry).toBe(32);
  const withoutManager = await generateOptimalSquad('4-3-1-2', { FW: [salma], MF: [], DF: [] },
    350000, 33, false, { currentSquad });
  expect(withoutManager.success).toBe(false);
  expect(withoutManager.totalChemistry).toBe(32);
  expect(withoutManager.iterations).toBe(1);
  expect(withoutManager.stageAttempts).toEqual([1, 0, 0, 0]);
});

test('extracts threshold-minus-one deficits using normalized calculator counts', () => {
  const squad = Array.from({ length: 4 }, (_, i) => ({ ...card(i, 'CM'),
    id: String(i), slotPosition: 'CM', price: 0, metaScore: 90, playerKey: String(i),
    card: card(i, 'CM'), isLocked: true, isOwned: true }));
  const deficits = getChemistryDeficits(squad);
  expect(deficits.nation.has('spain')).toBe(true);
  expect(deficits.league.has('arkema')).toBe(true);
  expect(deficits.club.size).toBe(0);
});

test('stops at the first valid pair from a large full pool and yields to the event loop', async () => {
  const slots = FORMATIONS.find(f => f.name === '4-3-1-2')!.slots;
  const currentSquad = Object.fromEntries(slots.filter(s => !['LS', 'RS'].includes(s.position))
    .map((s, i) => [s.position, { card: card(i, s.position), isLocked: true, isOwned: true }]));
  const candidates = Array.from({ length: 350 }, (_, i) => card(100 + i, 'LW', {
    altPositions: ['ST'], overall: 90 + i / 1000, price: 1000,
  }));
  let yielded = false;
  const timer = setTimeout(() => { yielded = true; }, 0);
  const started = performance.now();
  const result = await generateOptimalSquad('4-3-1-2', { FW: candidates, MF: [], DF: [] },
    350000, 33, true, { currentSquad });
  clearTimeout(timer);
  console.info(`Direct solver: 350 cards, two slots, ${(performance.now() - started).toFixed(1)} ms`);
  expect(yielded).toBe(true);
  expect(result.success).toBe(true);
  expect(result.iterations).toBe(1);
  expect(result.stageAttempts.slice(1)).toEqual([0, 0, 0]);
  expect(result.squad.filter(p => !p.isLocked).map(p => p.id).sort()).toEqual(['448', '449']);
  expect(calculateSquadChemistry(result.squad, true).totalChemistry).toBe(result.totalChemistry);
});

test.each([['CCM', 'CM'], ['LCM', 'CM'], ['RDM', 'CDM'], ['LCB', 'CB'], ['RAM', 'CAM']])(
  'normalizes %s to %s consistently', (slot, position) => {
    expect(getNormalizedSlot(slot)).toBe(position);
    expect(normalizeChemistryPosition(slot)).toBe(position);
  });

test('filters positions before limiting the full candidate pool', async () => {
  const slots = FORMATIONS.find(f => f.name === '4-3-1-2')!.slots;
  const currentSquad = Object.fromEntries(slots.filter(s => s.position !== 'LS')
    .map((s, i) => [s.position, { card: card(i, s.position), isLocked: true, isOwned: true }]));
  const wrongPositions = Array.from({ length: 500 }, (_, i) => card(100 + i, 'CM', { overall: 99 }));
  const salma = card(999, 'LW', { altPositions: ['ST'], price: 320000 });
  const result = await generateOptimalSquad('4-3-1-2', { FW: [...wrongPositions, salma], MF: [], DF: [] },
    350000, 33, true, { currentSquad });
  expect(result.success).toBe(true);
  expect(result.squad.find(p => p.slotPosition === 'LS')?.id).toBe('999');
  expect(result.iterations).toBe(1);
});

test.each(['array', 'indices', 'positions', 'normalized'])(
  'restores locks from %s and enters the direct solver with one or two open slots', async shape => {
    const slots = FORMATIONS.find(f => f.name === '4-3-1-2')!.slots;
    for (const open of [['LS'], ['LS', 'GK']]) {
      const entries = slots.map((slot, i) => open.includes(slot.position) ? null
        : { card: card(i, slot.position), isLocked: true, isOwned: false });
      const currentSquad = shape === 'array' ? entries : Object.fromEntries(entries.flatMap((entry, i) => {
        if (!entry) return [];
        const position = slots[i].position;
        // Only alias RS: repeated normalized positions otherwise cannot distinguish two slots.
        const key = shape === 'indices' ? String(i) : shape === 'normalized' && position === 'RS' ? 'ST' : position;
        return [[key, entry]];
      }));
      // With a normalized ST key, explicitly leave LS unlocked to disambiguate the two strikers.
      if (shape === 'normalized') (currentSquad as any).LS = { card: card(9999, 'ST'), isLocked: false };
      const before = structuredClone(currentSquad);
      const result = await generateOptimalSquad('4-3-1-2', {
        FW: [card(1000, 'LW', { altPositions: ['ST'], price: 320000 })], MF: [], DF: [card(1001, 'GK')],
      }, 350000, 33, true, { currentSquad: currentSquad as any });
      expect(result.success).toBe(true);
      expect(result.squad.filter(p => p.isLocked)).toHaveLength(11 - open.length);
      expect(result.squad.find(p => p.slotPosition === 'LS')?.id).toBe('1000');
      expect(result.totalCost).toBe(330000);
      expect(result.iterations).toBe(1);
      expect(result.stageAttempts).toEqual([1, 0, 0, 0]);
      expect(currentSquad).toEqual(before);
    }
  });

test.each(['array', 'indices'])('preserves ten distinct locks with repeated CM/CB slot names (%s)', async shape => {
  const original = FORMATIONS.find(f => f.name === '4-3-1-2')!;
  const layout = { ...original, name: '4-3-1-2 duplicate-slot regression',
    slots: original.slots.map(slot => ({ ...slot, position: ['LCM', 'RCM'].includes(slot.position) ? 'CM'
      : ['LCB', 'RCB'].includes(slot.position) ? 'CB' : slot.position })) };
  FORMATIONS.push(layout);
  try {
    const entries = layout.slots.map((slot, i) => i === 0 ? null
      : { card: card(i, slot.position), isLocked: true, isOwned: false });
    const currentSquad = shape === 'array' ? entries : Object.fromEntries(entries.map((entry, i) => [i, entry]));
    const before = structuredClone(currentSquad);
    const result = await generateOptimalSquad(layout.name,
      { FW: [card(1000, 'LW', { altPositions: ['ST'], price: 320000 })], MF: [], DF: [] },
      350000, 33, true, { currentSquad });
    expect(result.success).toBe(true);
    expect(result.squad.filter(p => p.isLocked)).toHaveLength(10);
    expect(new Set(result.squad.filter(p => p.isLocked).map(p => p.id)).size).toBe(10);
    expect(result.squad.filter(p => p.isLocked && p.slotPosition === 'CM')).toHaveLength(3);
    expect(result.squad.filter(p => p.isLocked && p.slotPosition === 'CB')).toHaveLength(2);
    expect(result.totalCost).toBe(330000);
    expect(result.stageAttempts).toEqual([1, 0, 0, 0]);
    expect(currentSquad).toEqual(before);
  } finally {
    FORMATIONS.splice(FORMATIONS.indexOf(layout), 1);
  }
});

test('normalization preserves explicit empty indices and does not alias the input array', () => {
  const entry = { card: card(1, 'ST'), isLocked: true };
  expect(getNormalizedSquadArray({ 0: null, ST: entry }, 1, [{ position: 'ST' }])).toEqual([null]);
  const input = [null, entry];
  const normalized = getNormalizedSquadArray(input, 3);
  expect(normalized).toEqual([null, entry, null]);
  expect(normalized).not.toBe(input);
});

test.each(['Arkema PL', 'Liga F'])('allows a fourth league %s past a saturated Premier League', async leagueId => {
  const slots = FORMATIONS.find(f => f.name === '4-3-1-2')!.slots;
  const currentSquad = slots.map((slot, i) => i === 0 ? null : {
    card: card(i, slot.position, { leagueId: i <= 5 ? 'Premier League' : i <= 8 ? 'LALIGA' : 'Third',
      nationId: i <= 5 ? 'England' : 'Spain', clubId: i <= 5 ? 'English Club' : 'Barcelona' }),
    isLocked: true, isOwned: true,
  });
  const rivals = Array.from({ length: 40 }, (_, i) => card(100 + i, 'ST', {
    overall: 99, leagueId: 'Premier League', nationId: 'Other', clubId: 'Other',
  }));
  const target = card(999, 'LW', { altPositions: ['ST'], price: 320000, leagueId,
    nationId: 'Spain', clubId: 'Barcelona' });
  const result = await generateOptimalSquad('4-3-1-2', { FW: [...rivals, target], MF: [], DF: [] },
    350000, 33, false, { currentSquad });
  expect(result.success).toBe(true);
  expect(result.totalChemistry).toBe(33);
  expect(Number.isFinite(result.finalScore)).toBe(true);
  expect(result.squad.find(p => !p.isLocked)?.id).toBe('999');
  expect(result.iterations).toBe(1);
  const fixed = result.squad.filter(p => p.isLocked);
  expect(isActiveLeagueCandidate(result.squad.find(p => !p.isLocked)!, fixed)).toBe(true);
  expect(getEffectiveCoreLeague(fixed, 'Premier League')).not.toBe('premier league');
});

test('allows a nation deficit bridge while preserving the normal active-league restriction', () => {
  const squad = Array.from({ length: 4 }, (_, i) => ({ ...card(i, 'CM', {
    leagueId: ['A', 'B', 'C', 'A'][i], nationId: 'Spain', clubId: String(i),
  }), id: String(i), slotPosition: 'CM' }));
  expect(isActiveLeagueCandidate(card(100, 'ST', { leagueId: 'D', nationId: 'Spain', clubId: 'new' }) as any, squad)).toBe(true);
  expect(isActiveLeagueCandidate(card(101, 'ST', { leagueId: 'D', nationId: 'Other', clubId: 'new' }) as any, squad)).toBe(false);
});
