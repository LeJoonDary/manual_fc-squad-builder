import { expect, test, vi } from 'vitest';
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
test('zero other players falls back without overwriting the preference',()=>{
  const state=createEmptySlotTabState();state.select('chem_boost',3);
  expect(state.active(0)).toBe('all_meta');expect(state.active(1)).toBe('chem_boost');
  expect(state.select('meta_synergy',0)).toBe('all_meta');
});

test.each(['all_meta', 'meta_synergy', 'chem_boost'])('restores %s without writing until a valid user selection', tab => {
  const storage = { getItem: vi.fn(() => tab), setItem: vi.fn() };
  const state = createEmptySlotTabState();
  expect(state.active(1)).toBe('all_meta');
  state.restore(() => storage);
  expect(state.active(0)).toBe('all_meta');
  expect(state.active(1)).toBe(tab);
  state.select('my_evos', 1);
  expect(state.active(1)).toBe(tab);
  expect(storage.setItem).not.toHaveBeenCalled();
  state.select('all_meta', 1);
  expect(storage.setItem).toHaveBeenCalledExactlyOnceWith('metaxi_preferred_select_tab_v1', 'all_meta');
});

test('invalid values and blocked storage retain a usable default and session preference', () => {
  const state = createEmptySlotTabState();
  state.restore(() => ({ getItem: () => 'my_evos', setItem: () => { throw Error('blocked'); } }));
  expect(state.active(1)).toBe('all_meta');
  expect(state.select('chem_boost', 1)).toBe('chem_boost');
  const blocked = createEmptySlotTabState();
  blocked.restore(() => { throw Error('blocked'); });
  expect(blocked.active(1)).toBe('all_meta');
});
test('preferences are in-memory and independent',()=>{
  const state=createEmptySlotTabState();state.select('meta_synergy',1);
  expect(createEmptySlotTabState().active(1)).toBe('all_meta');
});
