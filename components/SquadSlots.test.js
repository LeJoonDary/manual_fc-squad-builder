// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { createSquadSlots, SQUAD_SLOTS_KEY } from './SquadSlots.js';
import { FORMATIONS } from '../utils/formations.js';

let current, mount, notify, loadSquad;
beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="slots"></div>';
  mount = document.querySelector('#slots');
  const formation = FORMATIONS.find(item => item.name === '4-3-3');
  current = { formation: formation.name, players: Object.fromEntries(formation.slots.map(({ position }, id) =>
    [position, { card: { id, name: `Player ${id}` }, isLocked: id === 0, isOwned: id === 1 }])),
  manager: { nation: 'Brazil', league: 'Test' }, totalCost: 10000, totalChemistry: 33 };
  notify = vi.fn();
  loadSquad = vi.fn(saved => { current = saved; });
});
const setup = extra => createSquadSlots({ mount, getCurrent: () => current, loadSquad, notify, ...extra });
const click = action => mount.querySelector(`[data-action="${action}"]`).click();

test('saves detached snapshots, survives remount and loads all state', () => {
  setup(); click('slot-1');
  current.players.LW.card.name = 'Changed';
  setup(); click('slot-1');
  expect(loadSquad).toHaveBeenCalledOnce();
  expect(current.players.LW.card.name).toBe('Player 0');
  expect(current.players.LW.isLocked).toBe(true);
  expect(current.manager.nation).toBe('Brazil');
  expect(mount.querySelector('[data-action="slot-1"]').getAttribute('aria-pressed')).toBe('true');
});

test('overwrite and clear affect only selected slot and never clear the pitch', () => {
  setup(); click('slot-1'); click('slot-2');
  current.totalCost = 20000;
  click('Overwrite-1');
  expect(JSON.parse(localStorage.getItem(SQUAD_SLOTS_KEY)).find(slot => slot.id === 1).totalCost).toBe(20000);
  click('Clear-1');
  expect(JSON.parse(localStorage.getItem(SQUAD_SLOTS_KEY)).map(slot => slot.id)).toEqual([2]);
  expect(Object.keys(current.players)).toHaveLength(11);
  expect(loadSquad).not.toHaveBeenCalled();
});

test('rejects incomplete squads and clears active highlight after an edit', () => {
  const slots = setup(); click('slot-1');
  delete current.players.LW;
  slots.sync();
  expect(mount.querySelector('.is-active')).toBeNull();
  click('Overwrite-1');
  expect(notify).toHaveBeenLastCalledWith(expect.stringContaining('11 players'));
  expect(Object.keys(JSON.parse(localStorage.getItem(SQUAD_SLOTS_KEY))[0].players)).toHaveLength(11);
});

test('handles corrupt and unavailable storage without false success', () => {
  localStorage.setItem(SQUAD_SLOTS_KEY, '{invalid');
  setup();
  expect(mount.querySelectorAll('.squad-slot-main')).toHaveLength(3);
  setup({ storage: () => ({ getItem: () => '[]', setItem: () => { throw new Error('Quota'); } }) });
  click('slot-1');
  expect(mount.querySelector('.is-saved')).toBeNull();
  expect(notify).toHaveBeenLastCalledWith(expect.stringContaining('full or unavailable'));
});
