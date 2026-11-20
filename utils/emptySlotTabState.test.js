import { expect, test } from 'vitest';
import { createEmptySlotTabState } from './emptySlotTabState';
test('starts all-meta even when shared squad already has locks',()=>{
  expect(createEmptySlotTabState().active(4)).toBe('all_meta');
});
test('retains all-meta while the user selects consecutive core players',()=>{
  const state=createEmptySlotTabState();
  for(const count of [0,1,2,3,4]) expect(state.active(count)).toBe('all_meta');
});
test.each(['meta_synergy','chem_boost'])('remembers %s across modal openings',tab=>{
  const state=createEmptySlotTabState();state.select(tab,2);
  expect(state.active(2)).toBe(tab);expect(state.active(3)).toBe(tab);
});
test('zero locks resets both visible and remembered tab, including after new locks',()=>{
  const state=createEmptySlotTabState();state.select('chem_boost',3);
  expect(state.active(0)).toBe('all_meta');expect(state.active(1)).toBe('all_meta');
  expect(state.select('meta_synergy',0)).toBe('all_meta');
});
test('preferences are in-memory and independent',()=>{
  const state=createEmptySlotTabState();state.select('meta_synergy',1);
  expect(createEmptySlotTabState().active(1)).toBe('all_meta');
});
