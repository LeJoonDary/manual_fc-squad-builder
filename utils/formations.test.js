import { expect, test } from 'vitest';
import { FORMATIONS, reassignFormation } from './formations.js';
import { calculateChemistry } from './chemistry.ts';

test('every formation has eleven unique slots and one goalkeeper within the field', () => {
  for (const formation of FORMATIONS) {
    expect(formation.slots).toHaveLength(11);
    expect(new Set(formation.slots.map(s => s.position)).size).toBe(11);
    expect(formation.slots.filter(s => s.position === 'GK')).toHaveLength(1);
    expect(formation.slots.every(s => s.x >= 12 && s.x <= 88 && s.y >= 5 && s.y <= 77)).toBe(true);
  }
});

test('formation changes retain all cards, locks and ownership exactly once', () => {
  const original = FORMATIONS.find(f => f.name === '4-3-3');
  const squad = Object.fromEntries(original.slots.map(({ position }, i) => [position, {
    card: { id: i }, isLocked: i % 2 === 0, isOwned: i % 3 === 0,
    chemistryCard: { id: String(i), position, clubId: 1, nationId: 1, leagueId: 1 },
  }]));
  for (const formation of FORMATIONS) {
    const next = reassignFormation(squad, formation.slots);
    expect(Object.values(next)).toHaveLength(11);
    expect(new Set(Object.values(next))).toEqual(new Set(Object.values(squad)));
    expect(next.GK).toBe(squad.GK);
  }
});

test('assignment handles alternative positions globally and recalculates incompatible positions', () => {
  const flexible = { card: {}, chemistryCard: { id: '1', position: 'ST', altPositions: ['CM'], clubId: 1 } };
  const striker = { card: {}, chemistryCard: { id: '2', position: 'ST', clubId: 1 } };
  const slots = [{ position: 'ST' }, { position: 'CM' }];
  const next = reassignFormation({ ST: flexible, RS: striker }, slots);
  expect(next.ST).toBe(striker);
  expect(next.CM).toBe(flexible);
  expect(calculateChemistry(slots.map(s => ({ ...s, player: next[s.position].chemistryCard }))).totalChemistry).toBe(2);
  const incompatible = reassignFormation({ ST: striker }, [{ position: 'GK' }]);
  expect(calculateChemistry([{ position: 'GK', player: incompatible.GK.chemistryCard }]).totalChemistry).toBe(0);
  expect(reassignFormation({}, slots)).toEqual({});
});
