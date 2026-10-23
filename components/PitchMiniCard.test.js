// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { createPitchMiniCard } from './PitchMiniCard.js';
import { AUTO_BUILD_CANDIDATE_SELECT } from '../utils/autoBuildUtils.ts';
import { PLAYER_LIST_SELECT } from '../utils/playerCatalog.js';
import { PLAYER_CARD_SELECT } from '../utils/playerCards.js';
import { createSquadEntry } from '../utils/squadLock.ts';

test('mini card renders Plus-first playstyles between affiliations and skills', () => {
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
  const icons = [...node.querySelectorAll('.pitch-mini-center .playstyle-icon')];
  expect(icons.map(icon => icon.getAttribute('aria-label'))).toEqual(['Power Shot+', 'Normal']);
  expect(icons[0].querySelector('img').getAttribute('src')).toBe('/plus.png');
  expect(node.querySelector('.pitch-mini-center').previousElementSibling.className).toBe('pitch-mini-affiliation-row');
  expect(node.querySelector('.pitch-mini-center').nextElementSibling.className).toBe('pitch-mini-skills');
  expect(node.querySelector('.pitch-mini-promo').textContent).toBe('Destined For Glory');
  expect(node.querySelectorAll('.pitch-mini-stats > span')).toHaveLength(6);
  expect(node.querySelector('.pitch-mini-affiliations').textContent).toBe('LALIGARMA');
  expect(node.textContent).not.toContain('999');
});

test('omits absent optional badges and deduplicates ICON affiliation', () => {
  const node = createPitchMiniCard({ name: 'Icon', club_id: 112658, league: 'icons', club: 'icons' });
  expect(node.querySelector('.pitch-mini-secondary')).toBeNull();
  expect(node.querySelector('.pitch-mini-plus')).toBeNull();
  expect(node.querySelector('.pitch-mini-playstyles')).toBeNull();
  expect(node.querySelector('.pitch-mini-skills')).toBeNull();
  expect(node.querySelector('.pitch-mini-affiliations').textContent).toBe('ICON');
});

test('keeps more than seven styles for wrapping without mutating the input', () => {
  const styles = Array.from({ length: 15 }, (_, index) => ({
    name: `Style ${index}`, isPlus: index === 14,
    image_url: '/normal.png', image_url_plus: '/plus.png',
  }));
  const node = createPitchMiniCard({ name: 'Many styles' }, styles);
  const icons = node.querySelectorAll('.pitch-mini-playstyles .playstyle-icon');
  expect(icons).toHaveLength(15);
  expect(icons[0].getAttribute('aria-label')).toBe('Style 14+');
  expect(styles[0].name).toBe('Style 0');
});


test('GK pitch card shows keeper labels and values', () => {
  const node = createPitchMiniCard({ position: 'GK', pac: 59, sho: 24, def: 52, player_stats: [{ gk_diving: 91, gk_handling: 90, gk_kicking: 89, gk_reflexes: 88, gk_positioning: 87, sprint_speed: 52 }] });
  expect([...node.querySelectorAll('.pitch-mini-stats small')].map(n => n.textContent)).toEqual(['DIV','HAN','KIC','REF','SPD','POS']);
  expect([...node.querySelectorAll('.pitch-mini-stats b')].map(n => n.textContent)).toEqual(['91','90','89','88','52','87']);
});

test.each(['playstyles', 'card_playstyles', 'playStyles'])('reads %s from squad state even when the optional styles argument is empty', field => {
  const joined = { is_plus: true, playstyles: [{ name: 'Technical', image_url: '/silver.png', image_url_plus: '/gold.png' }] };
  const card = { name: 'Putellas', playstyles: [], [field]: [joined] };
  const entry = createSquadEntry(1, card, {});
  const node = createPitchMiniCard(entry.card, []);
  expect(node.querySelector('.playstyle-icon').getAttribute('aria-label')).toBe('Technical+');
  expect(node.querySelector('.playstyle-icon img').getAttribute('src')).toBe('/gold.png');
});

test('merges raw joins and normalized styles without losing images or duplicating icons', () => {
  const node = createPitchMiniCard({ name: 'Zidane', playstyles: [{ name: 'Technical', isPlus: true }],
    raw: { card_playstyles: [{ is_plus: true, playstyles: { name: 'Technical', image_url_plus: '/gold.png' } }] },
  });
  expect(node.querySelectorAll('.playstyle-icon')).toHaveLength(1);
  expect(node.querySelector('img').getAttribute('src')).toBe('/gold.png');
});

test('manual, detail and auto-build queries all include both PlayStyle image variants', () => {
  for (const select of [PLAYER_LIST_SELECT, PLAYER_CARD_SELECT, AUTO_BUILD_CANDIDATE_SELECT]) {
    expect(select.replace(/\s/g, '')).toContain('playstyles(id,name,image_url,image_url_plus)');
  }
});
