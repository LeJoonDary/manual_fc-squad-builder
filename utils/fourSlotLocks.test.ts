import { expect, test } from 'vitest';
import { isActiveLeagueCandidate, isNewSelectionValid, calculateFinalSquadScore, generateOptimalSquad, groupCandidatePlayers } from './autoBuildUtils';
import fixture from '../scripts/mocks/fourSlotLockedCards.json';
import { isCardHero, isCardIcon } from './specialCardIdentity.js';
import { calculateChemistry } from './chemistry';

const card = (id: number, leagueId: string, extra = {}) => ({ id: String(id), position: 'CM',
  slotPosition: 'CM', leagueId, nationId: `nation-${id}`, clubId: `club-${id}`,
  overall: 90, price: 1000, metaScore: 90, ...extra });
const noSpecial = { maxIcons: 0, maxHeroes: 0 };
const lockedCore = (count: number) => Array.from({ length: count }, (_, i) =>
  card(i, ['LaLiga', 'WSL', 'Liga F', 'PL'][i % 4], { isLocked: true }));

test('allows the first ordinary striker with seven locks and four existing leagues', () => {
  const squad = lockedCore(7);
  expect(isActiveLeagueCandidate(card(100, 'Liga F'), squad)).toBe(true);
  expect(isActiveLeagueCandidate(card(100, 'new league'), squad)).toBe(true);
  expect(isNewSelectionValid([...squad, card(100, 'Liga F')], noSpecial)).toBe(true);
  const complete = [...squad, ...Array.from({ length: 4 }, (_, i) => card(100 + i, 'PL'))];
  expect(isNewSelectionValid(complete, noSpecial)).toBe(true);
  expect(Number.isFinite(calculateFinalSquadScore(complete, 33, 500000, false, 33, noSpecial))).toBe(true);
});

test('always permits existing league or shared club even outside the four-slot exception', () => {
  const squad = lockedCore(4);
  squad[0] = { ...squad[0], clubs: { name: 'FC Barcelona' } } as any;
  const existing = card(100, ' pl ');
  const bridge = card(101, 'new league', { clubs: { name: 'FC Barcelona Women' } });
  expect(isActiveLeagueCandidate(existing, squad)).toBe(true);
  expect(isActiveLeagueCandidate(bridge, squad)).toBe(true);
  expect(isNewSelectionValid([...squad, existing, bridge], noSpecial)).toBe(true);
  expect(Number.isFinite(calculateFinalSquadScore([...squad, existing, bridge], 33, 500000, false, 33, noSpecial))).toBe(true);
  expect(isActiveLeagueCandidate(card(102, 'unrelated'), squad)).toBe(false);
  expect(isNewSelectionValid([...squad, card(102, 'unrelated')], noSpecial)).toBe(false);
});

test('does not exempt a large unlocked squad or six locks from unrelated-league restrictions', () => {
  expect(isActiveLeagueCandidate(card(100, 'unrelated'), lockedCore(6))).toBe(false);
  const unlocked = lockedCore(7).map(p => ({ ...p, isLocked: false }));
  expect(isActiveLeagueCandidate(card(100, 'unrelated'), unlocked)).toBe(false);
  expect(isNewSelectionValid(unlocked, noSpecial)).toBe(false);
});

test('completes the real seven-lock 4-3-3 (2) puzzle without Icons or Heroes', async () => {
  const options = { ...noSpecial, currentSquad: fixture.currentSquad };
  const candidates = fixture.target.map(card => ({ ...card, candidateGroups: ['FW', 'MF', 'DF'] }));
  const result = await generateOptimalSquad('4-3-3 (2)', groupCandidatePlayers(candidates as any), 500000, 33, true, options);
  expect(result.success).toBe(true);
  expect(result.totalChemistry).toBe(33);
  expect(result.totalCost).toBe(197750);
  expect(result.squad.filter(p => !p.isLocked).map(p => p.id).sort()).toEqual(['20', '22', '31', '38']);
  expect(result.squad.some(p => !p.isLocked && (isCardIcon(p) || isCardHero(p)))).toBe(false);
  // Post-processing recalculates the manager in final slot order; PL/Poland also reaches 33.
  expect(result.manager?.maxChemistry).toBe(33);
  expect(calculateChemistry(result.squad.map(player => ({ position: player.slotPosition, player })),
    { leagueId: result.manager!.bestLeagueId!, nationId: result.manager!.bestNationId! }).totalChemistry).toBe(33);
  expect(calculateChemistry(result.squad.map(player => ({ position: player.slotPosition, player })),
    { leagueId: 'league:id:3', nationId: 'nation:id:11' }).totalChemistry).toBe(33);
  expect(Number.isFinite(result.finalScore)).toBe(true);
  for (const [index, entry] of Object.entries(fixture.currentSquad)) {
    expect(result.squad[Number(index)].id).toBe(String(entry.card.id));
    expect(result.squad[Number(index)].isLocked).toBe(true);
  }
});
