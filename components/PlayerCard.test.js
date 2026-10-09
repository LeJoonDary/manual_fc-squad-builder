// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createPlayerCard } from './PlayerCard.js';
import { createPlaystyleIcons } from './PlaystyleIcons.js';

test('shared card renders the reference layout and selection works with keyboard and click', () => {
  const onActivate = vi.fn();
  const card = {name:'Erling Haaland',overall:91,version:'Gold',primary_position:'ST',
    preferred_foot:'Left',sm:3,wf:3,meta_score:87.5,score_position:'ST',
    nation_flag_url:'https://example.com/no.png',league_short_name:'EPL',club_short_name:'MCI',
    pac:87,sho:92,pas:70,dri:80,def:47,phy:88,raw:{background_url:'https://example.com/gold.png'}};
  const node=createPlayerCard(card, {onActivate, actionLabel:'Select Player',textAffiliations:true,
    getCardName:c=>c.name,getCardRating:c=>c.overall,getCardPosition:c=>c.primary_position,
    getChemistryEntityLogo:()=>'',affiliationCatalog:{},unwrapRelation:v=>v,
    createPlaystyleBadges:()=>document.createElement('div')});
  expect(node.querySelector('.browser-player-rating').textContent).toBe('91');
  expect(node.querySelector('.browser-player-content').style.backgroundImage).toContain('gold.png');
  expect(node.querySelector('.browser-player-flag').src).toContain('no.png');
  expect(node.querySelectorAll('.browser-player-stat')).toHaveLength(6);
  expect(node.querySelector('.browser-player-foot-skills').textContent).toContain('Foot: Left');
  expect(node.querySelector('.player-option-physical-info')).toBeNull();
  node.click();
  node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));
  node.dispatchEvent(new KeyboardEvent('keydown',{key:' '}));
  expect(onActivate).toHaveBeenCalledTimes(3);
  expect(onActivate).toHaveBeenLastCalledWith(card);
});

function renderCard(extra = {}) {
  return createPlayerCard({ name: 'Test', meta_score: null, ...extra }, {
    onActivate: () => {}, getCardName: c => c.name, getCardRating: () => 80,
    getCardPosition: () => 'ST', getChemistryEntityLogo: () => '', affiliationCatalog: {},
    unwrapRelation: value => Array.isArray(value) ? value[0] : value,
    createPlaystyleBadges: () => document.createElement('span'),
  });
}

test('cached summaries render six face stats without a portrait or unknown meta score', () => {
  const card = renderCard({ summary_only: true, image_url: 'https://example.com/player.png',
    raw: { player_stats: { pac: 91, sho: 82, pas: 73, dri: 84, def: 55, phy: 66 } } });
  expect(card.querySelector('.browser-player-rating')).not.toBeNull();
  expect(card.querySelector('img')).toBeNull();
  expect(card.querySelector('.browser-player-meta-score')).toBeNull();
  expect([...card.querySelectorAll('.browser-player-stat-label')].map(node => node.textContent)).toEqual(['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY']);
  expect([...card.querySelectorAll('.browser-player-stat-value')].map(node => node.textContent)).toEqual(['91', '82', '73', '84', '55', '66']);
});

test('renders two priority roles and the remaining count, with safe emblem fallback', () => {
  const card = renderCard({ height: '185', weight: 80, body_type: 'Lean',
    club: 'Example Club', club_short_name: 'EXC', league: 'Example League', league_short_name: 'EXL',
    raw: { clubs: { image_url: '/club.png' }, leagues: { image_url: '/league.png' } },
    card_roles: [
      { role_level: 1, roles: { role_name: 'Ignored' } },
      ...Array.from({ length: 5 }, (_, i) => ({ role_level: 2, roles: { position: 'ST', role_name: `Role ${i}` } })),
      { role_level: 2, roles: null },
    ],
  });
  expect(card.querySelector('.browser-player-physical').textContent).toBe('185cm · 80kg | Lean');
  expect(card.querySelectorAll('.browser-player-elite-roles > span')).toHaveLength(2);
  expect(card.querySelector('.browser-player-roles-more').textContent).toBe('+4');
  expect(card.querySelector('.browser-player-elite-roles').textContent).not.toContain('Ignored');
  expect(card.querySelectorAll('.browser-player-logo')).toHaveLength(0);
  expect(card.querySelector('.browser-player-affiliations').textContent).toContain('EXLEXC');
});

test('ICON names and club ID render shared shield emblems without raw text', () => {
  for (const extra of [
    { league: 'icons', club: '112658-icon' },
    { club_id: 112658, league: 'League', club: 'Club' },
    { raw: { clubs: { id: 112658, name: 'Club' }, leagues: { id: 1, name: 'League' } } },
  ]) {
    const card = renderCard(extra);
    expect(card.querySelectorAll('.browser-player-icon-emblem svg')).toHaveLength(2);
    expect(card.querySelector('.browser-player-affiliations').textContent).not.toMatch(/112658-icon|icons/);
  }
});

test('omits missing or invalid measurements and empty elite roles without blank wrappers', () => {
  for (const extra of [{}, { height: 185 }, { height: 0, weight: 80 }, { height: 'unknown', weight: 80 },
    { height: true, weight: 80 }, { height: 185, weight: -1 }]) {
    const card = renderCard(extra);
    expect(card.querySelector('.browser-player-physical')).toBeNull();
    expect(card.querySelector('.browser-player-elite-roles')).toBeNull();
  }
  expect(renderCard({ height: 180, weight: 75 }).querySelector('.browser-player-physical').textContent)
    .toBe('180cm · 75kg');
});

test.each([0, 1, 2, 3])('renders %s roles with overflow only beyond two', count => {
  const card = renderCard({ card_roles: Array.from({ length: count }, (_, id) => ({
    role_level: id % 3, roles: { role_name: `Role ${id}`, position: 'ST' },
  })) });
  expect(card.querySelectorAll('.browser-player-elite-roles > span')).toHaveLength(Math.min(count, 2));
  expect(card.querySelector('.browser-player-roles-more')?.textContent ?? null).toBe(count > 2 ? '+1' : null);
});

test('overflow opens details without selecting the squad card; cached playstyle icons still render', () => {
  const onActivate = vi.fn();
  const onShowDetails = vi.fn();
  const card = { summary_only: true, image_url: '/portrait.png',
    card_roles: Array.from({ length: 3 }, (_, id) => ({ role_level: 2, roles: { role_name: `Role ${id}` } })),
    raw: { card_playstyles: [
      { is_plus: false, playstyles: { name: 'Rapid', image_url: '/rapid.png' } },
      { is_plus: true, playstyles: { name: 'Finesse Shot', image_url_plus: '/finesse-plus.png' } },
    ] },
  };
  const node = createPlayerCard(card, {
    onActivate, onShowDetails, getCardName: () => 'Test', getCardRating: () => 90,
    getCardPosition: () => 'ST', affiliationCatalog: {}, unwrapRelation: value => value,
    createPlaystyleBadges: (value, limit, className) => createPlaystyleIcons(value.raw.card_playstyles.map(row => ({
      ...row.playstyles, isPlus: row.is_plus,
    })), className),
  });
  const more = node.querySelector('.browser-player-roles-more');
  more.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  more.click();
  expect(onActivate).not.toHaveBeenCalled();
  expect(onShowDetails).toHaveBeenCalledWith(card);
  expect([...node.querySelectorAll('img')].map(image => image.getAttribute('src'))).toEqual(['/finesse-plus.png', '/rapid.png']);
});


test('GK catalog card shows keeper labels and values', () => {
  const node = renderCard({ assignedPosition: 'GK', pac: 59, sho: 24, def: 52, player_stats: [{ gk_diving: 91, gk_handling: 90, gk_kicking: 89, gk_reflexes: 88, gk_positioning: 87, sprint_speed: 52 }] });
  expect([...node.querySelectorAll('.browser-player-stat-label')].map(n => n.textContent)).toEqual(['DIV','HAN','KIC','REF','SPD','POS']);
  expect([...node.querySelectorAll('.browser-player-stat-value')].map(n => n.textContent)).toEqual(['91','90','89','88','52','87']);
});
