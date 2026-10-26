import { expect, test } from 'vitest';
import { calculateDynamicSlotCap, getDynamicCandidatesForSlot, fitsAnchorBudgetCaps, generateOptimalSquad, type GeneratedPlayer } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';

test('base caps divide group targets and apply the 1.3 allowance', () => {
  const positions = ['LS', 'RS', 'CAM', 'LCM', 'CM', 'RCM', 'LCB', 'RCB', 'LB', 'RB', 'GK'];
  expect(calculateDynamicSlotCap('LS', positions, 1000000, false, 1000000, positions)).toBe(227500);
  expect(calculateDynamicSlotCap('CAM', ['CAM'], 1000000, false, 1000000, positions)).toBe(325000);
  expect(calculateDynamicSlotCap('CM', ['CM'], 1000000, false, 1000000, positions)).toBe(86666);
  expect(calculateDynamicSlotCap('LB', ['LB'], 1000000, false, 1000000, positions)).toBe(65000);
  expect(calculateDynamicSlotCap('GK', ['GK'], 1000000, false, 1000000, positions)).toBe(104000);
});
test('wing formation midfield uses 13% and wings share 20%', () => {
  const positions = ['LW', 'RW', 'CM', 'CDM', 'GK'];
  expect(calculateDynamicSlotCap('LW', positions, 1000000, false, 1000000, positions)).toBe(130000);
  expect(calculateDynamicSlotCap('CDM', positions, 1000000, false, 1000000, positions)).toBe(84500);
});
test('minimum reserve and unlimited mode are preserved', () => {
  expect(calculateDynamicSlotCap('CAM', ['CAM', 'GK'], 1500, false, 1000000)).toBe(500);
  expect(calculateDynamicSlotCap('CAM', ['CAM', 'GK'], 500)).toBe(0);
  expect(calculateDynamicSlotCap('GK', ['GK'], 0, true)).toBe(Infinity);
});

const make = (id: string, extra: Partial<GeneratedPlayer> = {}): GeneratedPlayer => ({ id, name: id, playerKey: id,
  position: 'CAM', slotPosition: 'CAM', nationId: 1, leagueId: 100, clubId: 1, price: 100,
  metaScore: 90, isLocked: false, isOwned: false, card: {}, ...extra });
const target = make('zero', { isLocked: true, price: 0 });
test('only stage-two matching Heroes pass a low cap but cannot bypass total budget or special limits', () => {
  const candidates = [make('hero', { isHero: true, price: 90000 }), make('icon', { isIcon: true, price: 100000 }),
    make('over', { isHero: true, price: 100001 }), make('ordinary', { price: 90000 }),
    make('wrong-league', { isHero: true, leagueId: 200, price: 90000 })];
  const run = (options = {}) => getDynamicCandidatesForSlot('CAM', [target], candidates, 30000,
    null, 25, null, false, 33, options, candidates, 100000);
  expect(run()).toEqual([]);
  expect(run({ allowVipRescue: true }).map(p => p.id)).toEqual(['hero']);
  expect(run({ allowVipRescue: true, maxHeroes: 0 })).toEqual([]);
  expect(run({ maxIcons: 0, maxHeroes: 0 })).toEqual([]);
});
test('upgrade budget replay uses the same VIP exception and subtracts locks only once', () => {
  const hero = make('hero', { isHero: true, price: 90000 });
  expect(fitsAnchorBudgetCaps([target, hero], 100000, false, true)).toBe(true);
  expect(fitsAnchorBudgetCaps([target, { ...hero, price: 100001 }], 100000)).toBe(false);
  const paid = make('paid', { isLocked: true, price: 300000 });
  const keeper = make('gk', { position: 'GK', slotPosition: 'GK', price: 40000 });
  expect(fitsAnchorBudgetCaps([paid, keeper], 500000, false, true)).toBe(true);
});

test('real backtracking and anchor collection retain an above-cap rescue Hero', async () => {
  const layout = FORMATIONS.find(f => f.name === '4-3-1-2')!;
  const currentSquad = Object.fromEntries(layout.slots.filter(slot => slot.position !== 'CAM').map((slot, i) => [slot.position, {
    isLocked: true, isOwned: true,
    card: { id: `fixed-${i}`, player_id: `fixed-${i}`, position: slot.position, price: 1000,
      overall: 85, pac: 90, def: 90, phy: 90, nationId: i === 0 ? 1 : 9,
      leagueId: i === 0 ? 100 : 200, clubId: i === 0 ? 1 : 9 },
  }]));
  const hero = { id: 'kuyt', player_id: 'kuyt', position: 'CAM', price: 90000, overall: 86,
    pac: 90, def: 90, phy: 90, nationId: 1, leagueId: 100, clubId: 2, isHero: true };
  const result = await generateOptimalSquad('4-3-1-2', { FW: [hero], MF: [], DF: [] }, 100000, 0, false,
    { currentSquad });
  expect(result.success).toBe(true);
  expect(result.squad.find(p => p.slotPosition === 'CAM')?.id).toBe('kuyt');
  expect(result.totalCost).toBe(90000);
  expect(fitsAnchorBudgetCaps(result.squad, 100000, false, true)).toBe(true);
});

 test('full formation counts prevent later striker caps from increasing', () => {
   expect(calculateDynamicSlotCap('RS', ['RS'], 90000, false, 100000, ['LS', 'RS', 'CAM'])).toBe(22750);
 });
 test('standard successful search respects the remaining total budget', async () => {
   const layout = FORMATIONS.find(f => f.name === '4-3-1-2')!;
   const currentSquad = Object.fromEntries(layout.slots.filter(s => s.position !== 'CAM').map((s, i) => [s.position, {
     isLocked: true, isOwned: true, card: { id: `lock-${i}`, player_id: `lock-${i}`, position: s.position,
       price: 1000, overall: 85, pac: 90, def: 90, phy: 90, nationId: 1, leagueId: 100, clubId: 1 },
   }]));
   const regular = { id: 'regular', player_id: 'regular', position: 'CAM', price: 20000, overall: 85, pac: 90, def: 90, phy: 90,
     nationId: 1, leagueId: 100, clubId: 1 };
   const hero = { ...regular, id: 'expensive', player_id: 'expensive', isHero: true, price: 100001, overall: 99 };
   const result = await generateOptimalSquad('4-3-1-2', { FW: [regular, hero], MF: [], DF: [] }, 100000, 33, false, { currentSquad });
   expect(result.success).toBe(true);
   expect(result.squad.find(p => p.slotPosition === 'CAM')?.id).toBe('regular');
 });

test('failed standard search reaches 33 using a matching Hero in the rescue pass', async () => {
  const layout = FORMATIONS.find(f => f.name === '4-3-1-2')!;
  const currentSquad = Object.fromEntries(layout.slots.filter(s => !['CAM', 'RS'].includes(s.position)).map((s, i) => [s.position, {
    isLocked: true, isOwned: true, card: { id: `fixed-${i}`, player_id: `fixed-${i}`, position: s.position,
      price: 1000, overall: 85, pac: 90, def: 90, phy: 90,
      nationId: i === 0 ? 1 : 9, leagueId: i === 0 ? 100 : 200, clubId: i === 0 ? 1 : 9 },
  }]));
  const hero = { id: 'rescue', player_id: 'rescue', position: 'CAM', price: 10000, overall: 86,
    pac: 90, def: 90, phy: 90, nationId: 1, leagueId: 100, clubId: 2, isHero: true };
  const striker = { ...hero, id: 'striker', player_id: 'striker', position: 'ST', price: 50000 };
  const result = await generateOptimalSquad('4-3-1-2', { FW: [hero, striker], MF: [], DF: [] }, 100000, 33, false,
    { currentSquad });
  expect(result.success).toBe(true);
  expect(result.totalChemistry).toBe(33);
  expect(result.squad.find(p => p.slotPosition === 'CAM')?.id).toBe('rescue');
});

test('cheap ST and CAM purchases release their savings to midfield', () => {
  const positions = ['LS', 'RS', 'CAM', 'LCM', 'CM', 'RCM', 'GK'];
  const filled = [{ slotPosition: 'LS', price: 42000 }, { slotPosition: 'CAM', price: 8500 }];
  // Targets 175k + 250k minus 50.5k spent = 374.5k carryover.
  expect(calculateDynamicSlotCap('CM', ['RS', 'LCM', 'CM', 'RCM', 'GK'], 949500,
    false, 1000000, positions, filled)).toBe(248950);
});
test('overspending does not create negative carryover and reserves still apply', () => {
  const positions = ['ST', 'CAM', 'GK'];
  expect(calculateDynamicSlotCap('CAM', ['CAM', 'GK'], 500000, false, 1000000, positions,
    [{ slotPosition: 'ST', price: 500000 }])).toBe(325000);
  expect(calculateDynamicSlotCap('CAM', ['CAM', 'GK'], 1500, false, 1000000, positions,
    [{ slotPosition: 'ST', price: 0 }])).toBe(500);
});
test('spent carryover is subtracted from later caps rather than reused', () => {
  const positions = ['ST', 'CAM', 'CM', 'GK'];
  const filled = [{ slotPosition: 'ST', price: 100000 }, { slotPosition: 'CAM', price: 500000 }];
  expect(calculateDynamicSlotCap('CM', ['CM', 'GK'], 400000, false, 1000000, positions, filled)).toBe(260000);
});
