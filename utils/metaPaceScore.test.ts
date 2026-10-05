import { expect, test } from 'vitest';
import { calculateMetaPaceScore } from './autoBuildUtils';

const card = {
  overall: 95,
  face_stats: { pac: 90, sho: 80, pas: 70, dri: 85, def: 60, phy: 75 },
  detail_stats: { agility: 80, balance: 70, finishing: 90, composure: 60,
    def_awareness: 80, standing_tackle: 70, strength: 90, stamina: 70,
    vision: 80, short_passing: 90 },
};

test.each(['ST', 'CF', 'LW', 'RW', 'LM', 'RM', 'CAM'])('attacker %s uses finishing and composure', position => {
  expect(calculateMetaPaceScore(card, position)).toBeCloseTo(90 * .35 + 75 * .25 + 78 * .25 + 82 * .15);
  expect(calculateMetaPaceScore({ ...card, detail_stats: { ...card.detail_stats, composure: 80 } }, position)
    - calculateMetaPaceScore(card, position)).toBeCloseTo(2);
});
test.each(['CB', 'LCB', 'RCB'])('CB pace has the largest weight in %s', position => {
  expect(calculateMetaPaceScore(card, position)).toBeCloseTo(90 * .4 + 75 * .35 + 82 * .25);
});
test.each(['CM', 'CDM'])('balanced midfield scoring for %s', position => {
  expect(calculateMetaPaceScore(card, position)).toBeCloseTo((460 / 6) * .35 + 90 * .25 + 85 * .2 + 78.5 * .2);
});
test.each(['LB', 'RB', 'LWB', 'RWB'])('fullback scoring for %s', position => {
  expect(calculateMetaPaceScore(card, position)).toBeCloseTo(90 * .35 + 75 * .3 + 82 * .2 + 70 * .15);
});
test('only the highest matching role bonus counts, with no primary position bonus', () => {
  const base = calculateMetaPaceScore(card, 'ST');
  expect(calculateMetaPaceScore({ ...card, primary_position: 'ST', roles: [
    { position: 'CB', level: 2 }, { position: 'ST', level: 1 },
  ] }, 'ST')).toBeCloseTo(base + 1.5);
  expect(calculateMetaPaceScore({ ...card, roles: [
    { position: 'ST', level: 2 }, { position: 'ST', level: 2 }, { position: 'ST', level: 1 },
  ] }, 'ST')).toBeCloseTo(base + 3);
  expect(calculateMetaPaceScore({ ...card, card_roles: [
    { role_level: 2, roles: { position: 'ST', role_name: 'Advanced Forward' } },
  ] }, 'ST')).toBeCloseTo(base + 3);
});
test('joined stats, missing values and goalkeeper fallback remain supported', () => {
  expect(calculateMetaPaceScore({ player_stats: [{ ...card.face_stats, ...card.detail_stats }] }, 'CB'))
    .toBeCloseTo(calculateMetaPaceScore(card, 'CB'));
  expect(calculateMetaPaceScore({}, 'ST')).toBeCloseTo(72.75);
  expect(calculateMetaPaceScore(card, 'GK')).toBe(95);
  expect(calculateMetaPaceScore({}, 'GK')).toBe(80);
});
