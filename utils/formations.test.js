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

test('enlarged cards and external prices fit without overlapping in every formation', () => {
  const fieldWidth = 800 - 8; // Minimum pitch width, excluding its borders.
  const cardWidth = 136;
  const groupHeight = 190 + 6 + 28;
  for (const formation of FORMATIONS) {
    const fieldHeight = formation.height - 8;
    const boxes = formation.slots.map(slot => ({
      left: slot.x / 100 * fieldWidth - cardWidth / 2,
      top: slot.y / 100 * fieldHeight,
    }));
    for (const [index, box] of boxes.entries()) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.left + cardWidth).toBeLessThanOrEqual(fieldWidth);
      expect(box.top + groupHeight).toBeLessThanOrEqual(fieldHeight);
      for (const other of boxes.slice(index + 1)) {
        const overlaps = Math.abs(box.left - other.left) < cardWidth
          && Math.abs(box.top - other.top) < groupHeight;
        expect(overlaps, `${formation.name}: slots ${index} and ${boxes.indexOf(other)}`).toBe(false);
      }
    }
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
