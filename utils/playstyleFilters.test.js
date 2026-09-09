import { test, expect } from 'vitest';
import { matchesPlaystyleFilters } from './playstyleFilters.js';

const rows = [{ playstyle_id: 35, is_plus: false }, { playstyle_id: 36, is_plus: true }];
test('matches exact Normal/Plus master IDs with OR and AND', () => {
  const normal = { id: 35, level: 'normal' };
  const plus = { id: 36, level: 'plus' };
  expect(matchesPlaystyleFilters(rows, { selectedPlayStyles: [normal, plus], requireAllPlaystyles: true })).toBe(true);
  const wrongLevel = { id: 35, level: 'plus' };
  expect(matchesPlaystyleFilters(rows, { selectedPlayStyles: [wrongLevel] })).toBe(false);
  expect(matchesPlaystyleFilters(rows, { selectedPlayStyles: [normal, wrongLevel] })).toBe(true);
  expect(matchesPlaystyleFilters(rows, { selectedPlayStyles: [normal, wrongLevel], requireAllPlaystyles: true })).toBe(false);
});
test('applies inclusive, separate count ranges and zero maximums', () => {
  expect(matchesPlaystyleFilters(rows, { minPlaystyles: 1, maxPlaystyles: 1, minPlaystylesPlus: 1, maxPlaystylesPlus: 1 })).toBe(true);
  expect(matchesPlaystyleFilters(rows, { maxPlaystylesPlus: 0 })).toBe(false);
  expect(matchesPlaystyleFilters(rows, { minPlaystyles: 2 })).toBe(false);
  expect(matchesPlaystyleFilters([], { maxPlaystyles: 0, maxPlaystylesPlus: 0 })).toBe(true);
  expect(matchesPlaystyleFilters([...rows, ...rows], { maxPlaystyles: 1, maxPlaystylesPlus: 1 })).toBe(true);
});
