import { expect, test } from 'vitest';
import { adaptChemistryPlayerCard } from './chemistry';
import { FORMATIONS } from './formations.js';
import { calculateSquadChemistry, refineCompletedSquad, generateOptimalSquad } from './autoBuildUtils';

const make = (id: number, position: string, price: number, score = 80, locked = false) => {
  const card = { id, player_id: id, position, overall: 90, price, pac: 90, def: 90, phy: 90,
    meta_score: score, league_id: 100, nation_id: 1, club_id: 1, isIcon: locked };
  return { ...adaptChemistryPlayerCard(card), card, id: String(id), playerKey: String(id),
    slotPosition: position, price, metaScore: score, isLocked: locked, isOwned: false };
};
const fixture = () => FORMATIONS.find(f => f.name === '4-3-3')!.slots
  .map((s, i) => make(i + 1, s.position, s.position === 'LB' ? 900 : 0, 80, s.position !== 'LB'));

test('upgrades a 900 C starter to the best affordable DB score and preserves inputs and chemistry', () => {
  const squad = fixture();
  const pool = [make(100, 'LB', 74000, 95), make(101, 'LB', 80000, 90), make(102, 'LB', 108000, 99)];
  const snapshot = structuredClone({ squad, pool });
  const result = refineCompletedSquad(squad, 106400, 107300, pool, false);
  expect(result.squad.find(p => p.slotPosition === 'LB')?.id).toBe('100');
  expect(result.remainingBudget).toBe(33300);
  expect(calculateSquadChemistry(result.squad, false).totalChemistry).toBe(33);
  expect(result.squad.filter(p => p.isLocked)).toEqual(squad.filter(p => p.isLocked));
  expect({ squad, pool }).toEqual(snapshot);
});

test('rejects wrong positions, duplicate players, exclusions and non-improvements', () => {
  const squad = fixture();
  const duplicate = { ...make(100, 'LB', 74000, 99), playerKey: squad[0].playerKey };
  const pool = [duplicate, make(101, 'ST', 74000, 99), make(102, 'LB', 74000, 99), make(103, 'LB', 74000, 80)];
  expect(refineCompletedSquad(squad, 106400, 107300, pool, false, 33,
    { excludedCardVersionIds: [102] }).squad).toEqual(squad);
  expect(refineCompletedSquad(squad.slice(1), 106400, 107300, pool, false).squad).toEqual(squad.slice(1));
});

test('main builder refines beyond construction slot cap and returns accurate remaining funds', async () => {
  const squad = fixture();
  const currentSquad = Object.fromEntries(squad.filter(p => p.isLocked).map(p => [p.slotPosition,
    { card: { ...p.card, price: 1000 }, isLocked: true, isOwned: true }]));
  const result = await generateOptimalSquad('4-3-3', { FW: [], MF: [], DF: [
    make(100, 'LB', 900, 80).card, make(101, 'LB', 74000, 95).card,
  ] }, 107300, 33, false, { currentSquad });
  expect(result.success).toBe(true);
  expect(result.squad.find(p => p.slotPosition === 'LB')?.id).toBe('101');
  expect(result.totalCost).toBe(74000);
  expect(result.remainingBudget).toBe(33300);
  expect(result.totalChemistry).toBe(33);
});

test('rejects stronger cards that reduce completed chemistry', () => {
  const squad = fixture().map(p => ({ ...p, isIcon: false, card: { ...p.card, isIcon: false } }));
  const candidate = make(100, 'LB', 74000, 99);
  const outsider = { ...candidate, nationId: 99, leagueId: 999, clubId: 999,
    card: { ...candidate.card, nation_id: 99, league_id: 999, club_id: 999 } };
  expect(calculateSquadChemistry(squad, false).totalChemistry).toBe(33);
  expect(refineCompletedSquad(squad, 106400, 107300, [outsider], false).squad).toEqual(squad);
});
