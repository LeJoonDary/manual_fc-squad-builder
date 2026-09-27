// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { createPitchChemistryBadge } from './PitchChemistryBadge.js';

test('chemistry lights zero to three diamonds arranged in a triangle, without a text bar', () => {
  for (let score = 0; score <= 3; score++) {
    const badge = createPitchChemistryBadge(score);
    expect([...badge.children].map(row => row.children.length)).toEqual([1, 2]);
    expect(badge.querySelectorAll('.is-filled')).toHaveLength(score);
    expect(badge.getAttribute('aria-label')).toBe(`케미스트리 ${score}점`);
    expect(badge.textContent).toBe('');
  }
});
