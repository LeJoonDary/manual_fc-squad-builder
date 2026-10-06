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
])('primary position adds exactly five points for supported data %j', primary => {
  for (const slot of ['CM', 'LCM', 'RCM']) {
    expect(calculateMetaPaceScore({ ...card, ...primary }, slot)).toBeCloseTo(calculateMetaPaceScore(card, slot) + 5);
  }
  expect(calculateMetaPaceScore({ ...card, ...primary }, 'CDM')).toBe(calculateMetaPaceScore(card, 'CDM'));
});

test('alternate positions earn no bonus and repeated primary sources do not stack', () => {
  const base = calculateMetaPaceScore(card, 'CM');
  const positions = [{ is_primary: true, positions: { name: 'ST' } },
    { is_primary: false, positions: { name: 'CM' } }];
  expect(calculateMetaPaceScore({ ...card, card_positions: positions }, 'CM')).toBe(base - 10);
  expect(calculateMetaPaceScore({ ...card, primary_position_str: 'CM',
    positions: [{ is_primary: true, name: 'CM' }], raw: { primary_position: 'CM' },
    roles: [{ position: 'CM', level: 2 }, { position: 'CM', level: 1 }] }, 'CM')).toBeCloseTo(base + 5);
});

test.each(['ST', 'CF', 'LW', 'RW', 'LM', 'RM', 'CAM'])('attacker %s uses finishing and composure', position => {
  expect(calculateMetaPaceScore(card, position)).toBeCloseTo(90 * .50 + 78 * .20 + 75 * .20 + 82 * .10);
  expect(calculateMetaPaceScore({ ...card, detail_stats: { ...card.detail_stats, composure: 80 } }, position)
    - calculateMetaPaceScore(card, position)).toBeCloseTo(1.6);
});
test.each(['CB', 'LCB', 'RCB'])('CB pace has the largest weight in %s', position => {
  expect(calculateMetaPaceScore(card, position)).toBeCloseTo(90 * .50 + 75 * .30 + 82 * .2);
});

test.each([[179, -20], [180, 0], [184, 0], [185, 0], [190, 0]])('CB height %s applies %s points', (height, bonus) => {
  for (const position of ['CB', 'LCB', 'RCB']) {
    expect(calculateMetaPaceScore({ ...card, height }, position)).toBeCloseTo(calculateMetaPaceScore(card, position) + bonus);
  }
  expect(calculateMetaPaceScore({ ...card, height }, 'CM')).toBe(calculateMetaPaceScore(card, 'CM'));
});

test.each([
  { detail_stats: { ...card.detail_stats, jumping: 90 } },
  { face_stats: { ...card.face_stats, phy: 90 } },
  { is_hero: true }, { is_icon: true }, { isHero: true }, { isIcon: true },
  { card_type: 'SPECIAL_HERO' }, { card_type: 'ICON' },
  { raw: { card_type: 'SPECIAL_ICON' } },
])('short aerial specialists receive only minus five: %j', extra => {
  expect(calculateMetaPaceScore({ ...card, ...extra, height: 179 }, 'CB'))
    .toBeCloseTo(calculateMetaPaceScore({ ...card, ...extra, height: 180 }, 'CB') - 5);
});

test.each([
  { height: '179' }, { playerDef: { height: 179 } }, { players: { height: 179 } },
  { players: [{ height: 179 }] }, { raw: { players: { height: 179 } } },
])('reads height from normalized and joined cards: %j', height => {
  expect(calculateMetaPaceScore({ ...card, ...height }, 'CB')).toBeCloseTo(calculateMetaPaceScore(card, 'CB') - 20);
});

test.each([undefined, null, 0, '', 'unknown', NaN])('missing or invalid height %s defaults to 185cm for unknown gender', height => {
  expect(calculateMetaPaceScore({ ...card, height }, 'CB')).toBe(calculateMetaPaceScore(card, 'CB'));
});

test('height, male and primary bonuses stack without changing the 180cm baseline', () => {
  const base = calculateMetaPaceScore(card, 'CB');
  const extra = { gender: 'M', primary_position: 'CB', roles: [{ position: 'CB', level: 2 }] };
  expect(calculateMetaPaceScore({ ...card, ...extra, height: 180 }, 'CB')).toBeCloseTo(base + 5);
  expect(calculateMetaPaceScore({ ...card, ...extra, height: 185 }, 'CB')).toBeCloseTo(base + 5);
  expect(calculateMetaPaceScore({ ...card, height: 179, detail_stats: { ...card.detail_stats, jumping: 89 } }, 'CB'))
    .toBeCloseTo(base - 20);
});
test.each(['CM', 'CDM'])('balanced midfield scoring for %s', position => {
  expect(calculateMetaPaceScore(card, position)).toBeCloseTo(90 * .45 + (460 / 6) * .30 + 85 * .15 + 82 * .10);
});
test.each(['LB', 'RB', 'LWB', 'RWB'])('fullback scoring for %s', position => {
  expect(calculateMetaPaceScore(card, position)).toBeCloseTo(90 * .50 + 75 * .20 + 82 * .15 + 85 * .15);
  const { vision, short_passing, ...details } = card.detail_stats;
  expect(calculateMetaPaceScore({ ...card, detail_stats: details }, position))
    .toBeCloseTo(90 * .50 + 75 * .20 + 82 * .15 + 70 * .15);
  expect(calculateMetaPaceScore({}, position)).toBeCloseTo(44.75);
});
test('primary position bonus applies without role bonuses', () => {
  const base = calculateMetaPaceScore(card, 'ST');
  expect(calculateMetaPaceScore({ ...card, primary_position: 'ST', roles: [
    { position: 'CB', level: 2 }, { position: 'ST', level: 1 },
  ] }, 'ST')).toBeCloseTo(base + 5);
  expect(calculateMetaPaceScore({ ...card, roles: [
    { position: 'ST', level: 2 }, { position: 'ST', level: 2 }, { position: 'ST', level: 1 },
  ] }, 'ST')).toBeCloseTo(base);
  expect(calculateMetaPaceScore({ ...card, card_roles: [
    { role_level: 2, roles: { position: 'ST', role_name: 'Advanced Forward' } },
  ] }, 'ST')).toBeCloseTo(base);
});
test('joined stats, missing values and goalkeeper fallback remain supported', () => {
  expect(calculateMetaPaceScore({ player_stats: [{ ...card.face_stats, ...card.detail_stats }] }, 'CB'))
    .toBeCloseTo(calculateMetaPaceScore(card, 'CB'));
  expect(calculateMetaPaceScore({}, 'ST')).toBeCloseTo(48.4);
  expect(calculateMetaPaceScore(card, 'GK')).toBe(95);
  expect(calculateMetaPaceScore({}, 'GK')).toBe(80);
});

test.each([{ gender: 'Male' }, { gender: 1 }, { gender: 'M' }, { is_women: false },
  { players: { gender: 'Male' } }, { players: [{ gender: 'M' }] },
  { raw: { players: { is_women: false } } }])('male CB has no bonus for %j', gender => {
  for (const position of ['CB', 'LCB', 'RCB']) {
    expect(calculateMetaPaceScore({ ...card, ...gender }, position))
      .toBeCloseTo(calculateMetaPaceScore(card, position));
  }
  for (const position of ['ST', 'CM', 'LB']) {
    expect(calculateMetaPaceScore({ ...card, ...gender }, position)).toBe(calculateMetaPaceScore(card, position));
  }
});

test.each([{}, { gender: 'Female' }, { gender: 'F' }, { is_women: true }])('no male bonus for %j', gender => {
  expect(calculateMetaPaceScore({ ...card, ...gender }, 'CB')).toBe(calculateMetaPaceScore(card, 'CB') - (Object.keys(gender).length ? 45 : 0));
});

test('role metadata does not alter the score', () => {
  expect(calculateMetaPaceScore({ ...card, roles: [
    { role_name: 'ST++', level: 1, role_level: 2 }, { position: 'ST', level: 2 },
  ] }, 'ST')).toBeCloseTo(calculateMetaPaceScore(card, 'ST'));
});

test.each(['ST', 'CF', 'CAM', 'LW', 'RW', 'LM', 'RM'])('pace threshold and Lean Tall bonus for %s', position => {
  const fast = { ...card, face_stats: { ...card.face_stats, pac: position === 'CAM' ? 80 : 82 } };
  const slow = { ...card, face_stats: { ...card.face_stats, pac: position === 'CAM' ? 79 : 81 } };
  expect(calculateMetaPaceScore(fast, position) - calculateMetaPaceScore(slow, position)).toBeCloseTo(25.5);
  expect(calculateMetaPaceScore({ ...fast, body_type: 'Lean Tall' }, position)).toBeCloseTo(calculateMetaPaceScore(fast, position) + 2);
  expect(calculateMetaPaceScore({ ...fast, body_type: 'Lean Tall', primary_position_str: position }, position)).toBeCloseTo(calculateMetaPaceScore(fast, position) + 7);
});
test('GK excludes body bonus, and a secondary position has no deduction', () => {
  expect(calculateMetaPaceScore({ ...card, body_type: 'Lean Tall' }, 'GK')).toBe(95);
  expect(calculateMetaPaceScore({ ...card, primary_position_str: 'CM' }, 'ST')).toBe(calculateMetaPaceScore(card, 'ST'));
});

test.each([1, 2])('selected Role+ accepts either level without bonus %s', level => {
  const options = { slotRoleRequirements: { CM: { roleName: 'Playmaker', minLevel: 1 as const } } };
  const base = calculateMetaPaceScore(card, 'LCM');
  const withRole = { ...card, card_roles: [
    { role_level: 1, roles: { position: 'CM', role_name: 'Playmaker' } },
    { role_level: level, roles: [{ position: 'CM', role_name: 'Playmaker' }] },
  ] };
  expect(calculateMetaPaceScore(withRole, 'LCM', options)).toBeCloseTo(base);
  expect(calculateMetaPaceScore(card, 'LCM', options)).toBeCloseTo(-9999);
  expect(calculateMetaPaceScore({ ...card, roles: [{ position: 'CAM', role_name: 'Playmaker', level: 2 }] }, 'LCM', options)).toBeCloseTo(-9999);
});
test('strict Role++ excludes Role+ and missing roles; legacy soft mode cannot bypass requirements', () => {
  const options = { isStrictRoleMode: true, slotRoleRequirements: { ST: { roleName: 'Poacher', minLevel: 2 as const } } };
  const plus = { ...card, roles: [{ name: 'Poacher', level: 1 }] };
  expect(calculateMetaPaceScore(plus, 'ST', options)).toBe(-9999);
  expect(calculateMetaPaceScore(card, 'ST', options)).toBe(-9999);
  expect(calculateMetaPaceScore(plus, 'ST', { ...options, isStrictRoleMode: false })).toBe(-9999);
});
test('CAM at 80 and 81 keeps its score while strikers still receive the pace penalty', () => {
  for (const pac of [80, 81]) {
    const c = { ...card, face_stats: { ...card.face_stats, pac } };
    expect(calculateMetaPaceScore(c, 'CAM') - calculateMetaPaceScore(c, 'ST')).toBeCloseTo(25);
  }
});

test.each([['LM', 'LW'], ['LW', 'LM'], ['RM', 'RW'], ['RW', 'RM'], ['LB', 'LWB'], ['LWB', 'LB'], ['RB', 'RWB'], ['RWB', 'RB']])(
  'awards full primary bonus for slot %s and primary %s', (slot, primary) => {
    for (const source of [{ primary_position_str: primary }, { position_name: primary },
      { card_positions: [{ is_primary: true, positions: { name: primary } }] },
      { raw: { card_positions: [{ is_primary: true, positions: [{ name: primary }] }] } }]) {
      expect(calculateMetaPaceScore({ ...card, ...source }, slot)).toBeCloseTo(calculateMetaPaceScore(card, slot) + 5);
    }
  });
test.each([['CM', 'RW'], ['CDM', 'CM'], ['LM', 'RW'], ['LB', 'RWB']])(
  'does not award incompatible primary bonus in %s for %s', (slot, primary) => {
    expect(calculateMetaPaceScore({ ...card, primary_position_str: primary }, slot)).toBe(calculateMetaPaceScore(card, slot) - (slot === 'CM' && primary === 'RW' ? 10 : 0));
  });
test.each(['CM', 'CDM', 'LCM', 'RCM', 'LDM', 'RDM'])('midfield pace threshold is 70 for %s', position => {
  const score = (pac: number) => calculateMetaPaceScore({ ...card, face_stats: { ...card.face_stats, pac } }, position);
  // Pace affects the direct term and one sixth of the hexagon term.
  expect(score(70) - score(69)).toBeCloseTo(25.5);
  expect(score(71) - score(70)).toBeCloseTo(.5);
});
test.each(['LB', 'RB', 'LWB', 'RWB'])('fullback pace threshold is 82 for %s', position => {
  const score = (pac: number) => calculateMetaPaceScore({ ...card, face_stats: { ...card.face_stats, pac } }, position);
  expect(score(82) - score(81)).toBeCloseTo(25.5);
  expect(score(81) - score(80)).toBeCloseTo(.5);
});

test.each(['CM', 'CDM', 'LCM', 'RDM'])('penalizes defensive awareness below 60 in %s', position => {
  const score = (awareness: number) => calculateMetaPaceScore({ ...card, detail_stats: { ...card.detail_stats, def_awareness: awareness } }, position);
  expect(score(60) - score(59)).toBeCloseTo(30);
  const faceOnly = { ...card, detail_stats: {}, face_stats: { ...card.face_stats, def: 47 } };
  expect(calculateMetaPaceScore(faceOnly, position)).toBeCloseTo(
    calculateMetaPaceScore({ ...faceOnly, face_stats: { ...faceOnly.face_stats, def: 60 } }, position) - 30 - 13 * .30 / 6);
});
test.each([{ primary_position_str: 'RW' }, { position: 'ST' },
  { card_positions: [{ is_primary: true, positions: { name: 'LW' } }] },
  { raw: { card_positions: [{ is_primary: true, positions: [{ name: 'CF' }] }] } }
])('applies attacker-primary penalty through all supported card shapes %j', primary => {
  expect(calculateMetaPaceScore({ ...card, ...primary }, 'CM')).toBeCloseTo(calculateMetaPaceScore(card, 'CM') - 10);
});

test.each([{ isWomen: false }, { playerDef: { gender: 1 } }, { playerDef: { isWomen: false } },
  { raw: { playerDef: { gender: 'M' } } }, { players: [{ gender: 'Male' }] }])(
  'recognizes male metadata for both CB and GK: %j', gender => {
    const knownHeight = { ...card, height: 180 };
    expect(calculateMetaPaceScore({ ...knownHeight, ...gender }, 'CB') - calculateMetaPaceScore(knownHeight, 'CB')).toBeCloseTo(0);
    expect(calculateMetaPaceScore({ ...card, ...gender }, 'GK')).toBe(95);
  });
test('uses gender-specific missing-height defaults without overriding known height', () => {
  expect(calculateMetaPaceScore({ ...card, gender: 'M' }, 'CB')).toBeCloseTo(calculateMetaPaceScore({ ...card, gender: 'M', height: 186 }, 'CB'));
  expect(calculateMetaPaceScore({ ...card, gender: 'Female' }, 'CB')).toBeCloseTo(calculateMetaPaceScore({ ...card, gender: 'Female', height: 170 }, 'CB'));
});
test('slot-specific CM roles do not leak into LCM or RCM', () => {
  const options = { roleRequirementsBySlot: true, isStrictRoleMode: true, slotRoleRequirements: { CM: { roleName: 'Holding', minLevel: 2 as const } } };
  expect(calculateMetaPaceScore(card, 'CM', options)).toBe(-9999);
  expect(calculateMetaPaceScore(card, 'LCM', options)).toBe(calculateMetaPaceScore(card, 'LCM'));
});
