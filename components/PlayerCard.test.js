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
