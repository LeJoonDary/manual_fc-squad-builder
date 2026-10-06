import { expect, test } from 'vitest';
import { calculateMetaPaceScore } from './autoBuildUtils';

const card = {
  overall: 95,
  face_stats: { pac: 90, sho: 80, pas: 70, dri: 85, def: 60, phy: 75 },
  detail_stats: { agility: 80, balance: 70, finishing: 90, composure: 60,
    def_awareness: 80, standing_tackle: 70, strength: 90, stamina: 70,
    vision: 80, short_passing: 90 },
};

test.each([
  { primary_position_str: 'CM' },
  { primary_position: 'CM' },
  { position: 'CM' },
  { positions: [{ is_primary: true, name: 'CM' }] },
  { card_positions: [{ is_primary: true, positions: { name: 'CM' } }] },
  { card_positions: [{ is_primary: true, positions: [{ name: 'CM' }] }] },
  { card_positions: [{ is_primary: true, position: { name: 'CM' } }] },
  { card_positions: [{ is_primary: true, position_name: 'CM' }] },
  { raw: { card_positions: [{ is_primary: true, positions: { name: 'CM' } }] } },
])('primary position adds exactly one point for supported data %j', primary => {
  for (const slot of ['CM', 'LCM', 'RCM']) {
    expect(calculateMetaPaceScore({ ...card, ...primary }, slot)).toBeCloseTo(calculateMetaPaceScore(card, slot) + 1);
  }
  expect(calculateMetaPaceScore({ ...card, ...primary }, 'CDM')).toBe(calculateMetaPaceScore(card, 'CDM'));
});

test('alternate positions earn no bonus and repeated primary sources do not stack', () => {
  const base = calculateMetaPaceScore(card, 'CM');
  const positions = [{ is_primary: true, positions: { name: 'ST' } },
    { is_primary: false, positions: { name: 'CM' } }];
  expect(calculateMetaPaceScore({ ...card, card_positions: positions }, 'CM')).toBe(base);
  expect(calculateMetaPaceScore({ ...card, primary_position_str: 'CM',
    positions: [{ is_primary: true, name: 'CM' }], raw: { primary_position: 'CM' },
    roles: [{ position: 'CM', level: 2 }, { position: 'CM', level: 1 }] }, 'CM')).toBeCloseTo(base + 4);
});

test.each(['ST', 'CF', 'LW', 'RW', 'LM', 'RM', 'CAM'])('attacker %s uses finishing and composure', position => {
  expect(calculateMetaPaceScore(card, position)).toBeCloseTo(90 * .50 + 78 * .20 + 75 * .20 + 82 * .10);
  expect(calculateMetaPaceScore({ ...card, detail_stats: { ...card.detail_stats, composure: 80 } }, position)
    - calculateMetaPaceScore(card, position)).toBeCloseTo(1.6);
});
test.each(['CB', 'LCB', 'RCB'])('CB pace has the largest weight in %s', position => {
  expect(calculateMetaPaceScore(card, position)).toBeCloseTo(90 * .50 + 75 * .30 + 82 * .2);
});
test.each(['CM', 'CDM'])('balanced midfield scoring for %s', position => {
  expect(calculateMetaPaceScore(card, position)).toBeCloseTo(90 * .40 + (460 / 6) * .25 + 85 * .18 + 78.5 * .17);
});
test.each(['LB', 'RB', 'LWB', 'RWB'])('fullback scoring for %s', position => {
  expect(calculateMetaPaceScore(card, position)).toBeCloseTo(90 * .50 + 75 * .20 + 82 * .15 + 85 * .15);
  const { vision, short_passing, ...details } = card.detail_stats;
  expect(calculateMetaPaceScore({ ...card, detail_stats: details }, position))
    .toBeCloseTo(90 * .50 + 75 * .20 + 82 * .15 + 70 * .15);
  expect(calculateMetaPaceScore({}, position)).toBeCloseTo(69);
});
test('primary position bonus stacks with only the highest matching role bonus', () => {
  const base = calculateMetaPaceScore(card, 'ST');
  expect(calculateMetaPaceScore({ ...card, primary_position: 'ST', roles: [
    { position: 'CB', level: 2 }, { position: 'ST', level: 1 },
  ] }, 'ST')).toBeCloseTo(base + 2.5);
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
  expect(calculateMetaPaceScore({}, 'ST')).toBeCloseTo(73.4);
  expect(calculateMetaPaceScore(card, 'GK')).toBe(95);
  expect(calculateMetaPaceScore({}, 'GK')).toBe(80);
});

test.each([{ gender: 'Male' }, { gender: 1 }, { gender: 'M' }, { is_women: false },
  { players: { gender: 'Male' } }, { players: [{ gender: 'M' }] },
  { raw: { players: { is_women: false } } }])('male CB bonus supports %j', gender => {
  for (const position of ['CB', 'LCB', 'RCB']) {
    expect(calculateMetaPaceScore({ ...card, ...gender }, position))
      .toBeCloseTo(calculateMetaPaceScore(card, position) + 5);
  }
  for (const position of ['ST', 'CM', 'LB', 'GK']) {
    expect(calculateMetaPaceScore({ ...card, ...gender }, position)).toBe(calculateMetaPaceScore(card, position));
  }
});

test.each([{}, { gender: 'Female' }, { gender: 'F' }, { is_women: true }])('no male bonus for %j', gender => {
  expect(calculateMetaPaceScore({ ...card, ...gender }, 'CB')).toBe(calculateMetaPaceScore(card, 'CB'));
});

test('role prefixes and either level field use only the highest bonus', () => {
  expect(calculateMetaPaceScore({ ...card, roles: [
    { role_name: 'ST++', level: 1, role_level: 2 }, { position: 'ST', level: 2 },
  ] }, 'ST')).toBeCloseTo(calculateMetaPaceScore(card, 'ST') + 3);
});
