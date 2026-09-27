// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { createPitchMiniCard } from './PitchMiniCard.js';

test('mini card shows compact badges, Plus only, six stats and formatted identity', () => {
  const node = createPitchMiniCard({ name: 'Test Player', overall: 91, primary_position: 'ST',
    secondary_positions: ['ST', 'LW', 'LW'], preferred_foot: 'Right', sm: 5, wf: 4,
    version: 'special_destined_for_glory', league: 'La Liga', club: 'Real Madrid',
    pac: 90, sho: 91, pas: 82, dri: 88, def: 40, phy: 80, meta_score: 999,
  }, [{ name: 'Normal', isPlus: false, image_url: '/normal.png' },
    { name: 'Power Shot', isPlus: true, image_url_plus: '/plus.png' }]);
  expect(node.querySelector('.pitch-mini-rating').textContent).toBe('91ST');
  expect(node.querySelector('.pitch-mini-secondary').textContent).toBe('LW');
  expect(node.querySelector('.pitch-mini-skills').textContent).toBe('R5★4');
  expect(node.querySelectorAll('.pitch-mini-plus img')).toHaveLength(1);
  expect(node.querySelector('.pitch-mini-plus img').getAttribute('src')).toBe('/plus.png');
  expect(node.querySelector('.pitch-mini-promo').textContent).toBe('Destined For Glory');
  expect(node.querySelectorAll('.pitch-mini-stats > span')).toHaveLength(6);
  expect(node.querySelector('.pitch-mini-affiliations').textContent).toBe('LALIGARMA');
  expect(node.textContent).not.toContain('999');
});

test('omits absent optional badges and deduplicates ICON affiliation', () => {
  const node = createPitchMiniCard({ name: 'Icon', club_id: 112658, league: 'icons', club: 'icons' });
  expect(node.querySelector('.pitch-mini-secondary')).toBeNull();
  expect(node.querySelector('.pitch-mini-plus')).toBeNull();
  expect(node.querySelector('.pitch-mini-skills')).toBeNull();
  expect(node.querySelector('.pitch-mini-affiliations').textContent).toBe('ICON');
});
