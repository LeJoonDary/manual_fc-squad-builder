import { expect, test } from 'vitest';
import { adaptChemistryPlayerCard } from './chemistry';
import { FORMATIONS } from './formations.js';
import { passesNewCandidateFilter, refineCompletedSquad } from './autoBuildUtils';

const raw = (id: number, position: string, score = 97, price = 1000) => ({
  id, player_id: id, position, overall: 99, price, meta_score: score,
  pac: 95, def: 90, phy: 90, league_id: 100, nation_id: 1, club_id: 1,
});

test.each(['LW', 'RW', 'LM', 'RM', 'ST', 'LS', 'RST'])('%s rejects every primary defensive position', slot => {
  for (const position of ['LB', 'RB', 'CB', 'LWB', 'RWB']) {
    const defender = { ...raw(100, position), altPositions: ['LW', 'RW', 'LM', 'RM', 'ST'],
      card_positions: [{ is_primary: true, positions: { name: position } }] };
    expect(passesNewCandidateFilter(defender, slot, 1000000, [slot], { maxPriceCap: Infinity })).toBe(false);
    expect(passesNewCandidateFilter({ card: defender }, slot, 1000000, [slot], { maxPriceCap: Infinity })).toBe(false);
  }
  expect(passesNewCandidateFilter(raw(101, 'LW'), slot, 1000000, [slot], { maxPriceCap: Infinity })).toBe(true);
});

test.each([85, 95.4, 97, 98])('wing upgrade requires a strictly higher assigned-slot meta score (%s)', score => {
  const prepare = (card: ReturnType<typeof raw>, slot: string, locked = false) => ({
    ...adaptChemistryPlayerCard(card), card, slotPosition: slot, price: card.price,
    metaScore: card.meta_score, playerKey: String(card.player_id), isLocked: locked, isOwned: false,
  });
  const squad = FORMATIONS.find(f => f.name === '4-3-3')!.slots.map((s, i) =>
    prepare(raw(i, s.position), s.position, s.position !== 'LW'));
  const candidate = prepare(raw(100, 'LW', score, 100000), 'LW');
  const before = structuredClone(squad);
  const result = refineCompletedSquad(squad, 989000, 1000000, [candidate], false);
  expect(result.squad.find(p => p.slotPosition === 'LW')?.id)
    .toBe(score > 97 ? '100' : squad.find(p => p.slotPosition === 'LW')!.id);
  expect(result.remainingBudget).toBe(score > 97 ? 890000 : 989000);
  expect(squad).toEqual(before);
});
