import { expect, test } from 'vitest';
import { getCardFaceStats } from './cardFaceStats.js';

test.each(['position', 'assignedPosition', 'primary_position'])('GK labels via %s', key => {
  const card = { [key]: 'GK', pac: 90, sho: 89, pas: 88, dri: 87, def: 50, phy: 91, player_stats: [{ gk_diving: 90, gk_handling: 89, gk_kicking: 88, gk_reflexes: 87, gk_positioning: 91, sprint_speed: 50 }] };
  expect(getCardFaceStats(card)).toEqual([['DIV', 90], ['HAN', 89], ['KIC', 88], ['REF', 87], ['SPD', 50], ['POS', 91]]);
});
test('GK aliases and field labels', () => {
  const card = { position: 'GK', attributeGkDiving: 91, gk_handling: 90, gk_kicking: 89, attributeGkReflexes: 88, gkFaceSpeed: 52, gk_positioning: 87 };
  expect(getCardFaceStats(card).map(s => s[1])).toEqual([91,90,89,88,52,87]);
  expect(getCardFaceStats({ position: 'CM' }).map(s => s[0])).toEqual(['PAC','SHO','PAS','DRI','DEF','PHY']);
  expect(getCardFaceStats({ position: 'GK', pac: 0, gk_diving: 99 })[0][1]).toBe(99);
});

test('missing GK values do not display outfield shooting or pace', () => {
 expect(getCardFaceStats({ position: 'GK', pac: 59, sho: 24, pas: 30, dri: 40, def: 52, phy: 70 }).map(s => s[1])).toEqual([0,0,0,0,0,0]);
 expect(getCardFaceStats({ position: 'GK', gk_diving: 0, player_stats: { gk_diving: 99, sprint_speed: 45 }, gk_speed: 55 }).map(s=>s[1])).toEqual([0,0,0,0,55,0]);
});
