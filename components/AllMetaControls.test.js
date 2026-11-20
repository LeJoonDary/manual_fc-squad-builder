// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { emptySlotRecommendationBadge, createRecommendationControls } from './RecommendationControls';
import { setLanguage } from '../src/i18n/languageStore';
import { readFileSync, existsSync } from 'node:fs';
test('removed guide has no navigation, mount or unused component',()=>{
  expect(readFileSync('index.html','utf8')).not.toContain('guide-control');
  expect(readFileSync('main.js','utf8')).not.toContain('mountGuideControl');
  expect(existsSync('components/GuideModal.jsx')).toBe(false);
});
test('global meta badges distinguish neutral, linked and new league states in both languages',()=>{
  setLanguage('en',false);
  expect(emptySlotRecommendationBadge({leagueLabel:'ICON',chemDelta:3},0)).toEqual({text:'ICON',tone:'is-neutral'});
  expect(emptySlotRecommendationBadge({newLeagueWarning:true},1)).toEqual({text:'New League ⚠️',tone:'is-negative'});
  expect(emptySlotRecommendationBadge({linkName:'LALIGA',chemDelta:0},1).text).toBe('LALIGA 🔗');
  expect(emptySlotRecommendationBadge({leagueLabel:'Bundesliga'},1).text).toBe('Bundesliga');
  setLanguage('ko',false);
  expect(emptySlotRecommendationBadge({newLeagueWarning:true},1).text).toBe('새 리그 ⚠️');
  expect(emptySlotRecommendationBadge({chemDelta:2},1).text).toBe('+2 케미 🔥');
});
test('replacement retains exactly two enabled tabs regardless of lock count',()=>{
  const control=createRecommendationControls({mode:'replace',lockedCount:0,sort:'maintain_chem',onPrice:()=>{},onSort:()=>{}});
  const tabs=[...control.element.querySelectorAll('.recommendation-tabs button')];
  expect(tabs).toHaveLength(2);expect(tabs.every(button=>!button.disabled)).toBe(true);
});
