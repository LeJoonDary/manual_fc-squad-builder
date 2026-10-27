import { expect, test } from 'vitest';
import { AUTO_BUILD_CANDIDATE_SELECT, calculateSquadChemistry, calculateDynamicSlotCap, getCardMetaScore, getDynamicCandidatesForSlot, type GeneratedPlayer } from './autoBuildUtils';

const make = (id: string, score: number, price: number): GeneratedPlayer => ({
  id, name: id, playerKey: id, position: 'CM', slotPosition: 'CM', nationId: 1, leagueId: 1,
  clubId: 1, price, metaScore: 999, isLocked: false, isOwned: false,
  card: { overall: 85, card_positions: [{ positions: { name: 'CM' }, meta_score: score }] },
});

test('DB projection fetches positional meta scores', () => {
  expect(AUTO_BUILD_CANDIDATE_SELECT).toContain('card_positions(is_primary,meta_score,positions(name))');
});

test('Dali beats Sugita by DB CM score while cheap cards remain eligible at high budget', () => {
  const pool = [make('sugita', 79.05, 650), make('dali', 82.85, 1000), make('over-cap', 99, 5001)];
  const ranked = getDynamicCandidatesForSlot('LCM', [], pool, 5000,
    null, 25, null, false, 33, {}, pool, 1000000, 1000000);
  expect(ranked.map(card => card.id)).toEqual(['dali', 'sugita']);
});

test.each([
  { positions: [{ name: 'CM', meta_score: '82.85' }] },
  { positions: [{ position: 'CM', meta_score: '82.85' }] },
  { card_positions: [{ position: { name: 'CM' }, meta_score: '82.85' }] },
  { card_positions: [{ positions: [{ name: 'CM' }], meta_score: '82.85' }] },
])('reads positional join variants and aliases', card => {
  expect(getCardMetaScore({ card, metaScore: 999 }, 'RCM')).toBe(82.85);
});

test('ignores invalid and wrong-position scores and falls back safely', () => {
  expect(getCardMetaScore({ card_positions: [{ positions: { name: 'ST' }, meta_score: 99 }], overall: 86 }, 'CM')).toBe(86);
  expect(getCardMetaScore({ meta_score: 'bad', metaScore: '', rating: '88' }, 'CM')).toBe(88);
  expect(getCardMetaScore({ meta_score: 0, overall: 86 }, 'CM')).toBe(0);
  expect(getCardMetaScore({}, 'CM')).toBe(75);
});

test('GK includes manager chemistry even when caller disables it and selects OVR 90 over Hero 87', () => {
  const squad = Array.from({ length: 10 }, (_, i) => ({ ...make(`locked-${i}`, 85, 0),
    isLocked: true, nationId: 9, leagueId: i < 5 ? 100 : 200, clubId: i }));
  const keeper = { ...make('courtois', 80, 1000), position: 'GK', slotPosition: 'GK',
    nationId: 1, leagueId: 100, clubId: 99, card: { overall: 90 } };
  const hero = { ...keeper, id: 'campos', playerKey: 'campos', isHero: true, card: { overall: 87 } };
  expect(calculateSquadChemistry([...squad, keeper], false).totalChemistry).toBe(32);
  expect(calculateSquadChemistry([...squad, keeper], true).totalChemistry).toBe(33);
  expect(getDynamicCandidatesForSlot('GK', squad, [hero, keeper], 2000,
    null, 25, null, false)[0].id).toBe('courtois');
});

test('RB cannot absorb more than the 12% carryover allowance', () => {
  expect(calculateDynamicSlotCap('RB', ['RB'], 900000, false, 1000000,
    ['ST', 'LB', 'RB'], [{ slotPosition: 'ST', price: 1000 }])).toBe(143000);
});
