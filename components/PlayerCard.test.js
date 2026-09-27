// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { createPlayerCard } from './PlayerCard.js';

test('shared card renders the reference layout and selection works with keyboard and click', () => {
  const onActivate = vi.fn();
  const card = {name:'Erling Haaland',overall:91,version:'Gold',primary_position:'ST',
    preferred_foot:'Left',sm:3,wf:3,meta_score:87.5,score_position:'ST',
    nation_flag_url:'https://example.com/no.png',league_short_name:'EPL',club_short_name:'MCI',
    pac:87,sho:92,pas:70,dri:80,def:47,phy:88,raw:{background_url:'https://example.com/gold.png'}};
  const node=createPlayerCard(card, {onActivate, actionLabel:'선수 선택',textAffiliations:true,
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

test('renders valid measurements and at most four level-two roles, with safe emblem fallback', () => {
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
  expect(card.querySelectorAll('.browser-player-elite-roles > span')).toHaveLength(4);
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
    { height: true, weight: 80 }, { height: 185, weight: -1 },
    { card_roles: [{ role_level: 1, roles: { role_name: 'Poacher' } }] }]) {
    const card = renderCard(extra);
    expect(card.querySelector('.browser-player-physical')).toBeNull();
    expect(card.querySelector('.browser-player-elite-roles')).toBeNull();
  }
  expect(renderCard({ height: 180, weight: 75 }).querySelector('.browser-player-physical').textContent)
    .toBe('180cm · 75kg');
});
