// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { createPitchMiniCard } from './PitchMiniCard.js';

test('mini card keeps the center clear of roles and playstyles', () => {
  const node = createPitchMiniCard({ name: 'Test Player', overall: 91, primary_position: 'ST',
    secondary_positions: ['ST', 'LW', 'LW'], preferred_foot: 'Right', sm: 5, wf: 4,
    version: 'special_destined_for_glory', league: 'La Liga', club: 'Real Madrid',
    pac: 90, sho: 91, pas: 82, dri: 88, def: 40, phy: 80, meta_score: 999,
    card_roles: [{ role_level: 2, roles: { role_name: 'Inside Forward', position: 'LW' } }],
  }, [{ name: 'Normal', isPlus: false, image_url: '/normal.png' },
    { name: 'Power Shot', isPlus: true, image_url_plus: '/plus.png' }]);
  expect(node.querySelector('.pitch-mini-rating').textContent).toBe('91');
  expect(node.querySelector('.pitch-mini-position').textContent).toBe('ST');
  expect(node.querySelector('.pitch-mini-secondary').textContent).toBe('LW');
  expect(node.querySelector('.pitch-mini-skills').textContent).toBe('R5★4★');
  expect(node.querySelector('.pitch-mini-plus')).toBeNull();
  expect(node.querySelector('.pitch-mini-roles')).toBeNull();
  expect(node.querySelector('.playstyle-icon')).toBeNull();
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


test('GK pitch card shows keeper labels and values', () => {
  const node = createPitchMiniCard({ position: 'GK', pac: 59, sho: 24, def: 52, player_stats: [{ gk_diving: 91, gk_handling: 90, gk_kicking: 89, gk_reflexes: 88, gk_positioning: 87, sprint_speed: 52 }] });
  expect([...node.querySelectorAll('.pitch-mini-stats small')].map(n => n.textContent)).toEqual(['DIV','HAN','KIC','REF','SPD','POS']);
  expect([...node.querySelectorAll('.pitch-mini-stats b')].map(n => n.textContent)).toEqual(['91','90','89','88','52','87']);
});
