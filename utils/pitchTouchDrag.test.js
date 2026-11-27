// @vitest-environment jsdom
import { beforeAll, beforeEach, afterEach, expect, test, vi } from 'vitest';
import { bindPitchTouchDrag } from './pitchTouchDrag.js';

const root = document.createElement('div');
const move = vi.fn();
let source, target, entry, hit;
const finger = (x = 10, y = 10, identifier = 1) => ({ clientX: x, clientY: y, identifier });
function touch(type, node = source, touches = [finger()], changedTouches = touches) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { touches, changedTouches });
  node.dispatchEvent(event);
  return event;
}
beforeAll(() => {
  document.body.append(root);
  bindPitchTouchDrag(root, {
    getEntry: () => entry, isLocked: value => value.isLocked,
    canMove: (a, b) => a !== b && !b.dataset.locked,
    move,
  });
});
beforeEach(() => {
  vi.useFakeTimers();
  root.innerHTML = '<div data-pitch-slot="true"><div class="slot-card-body">Card</div><div class="slot-card-actions"><button>Lock</button></div></div><div data-pitch-slot="true"></div>';
  [source, target] = root.children;
  entry = { card: { id: 1 }, isLocked: false };
  hit = target;
  document.elementFromPoint = () => hit;
  move.mockClear();
});
afterEach(() => { touch('touchcancel'); vi.useRealTimers(); });

test('short taps and movement of 8px before the hold retain native behavior', () => {
  expect(touch('touchstart').defaultPrevented).toBe(false);
  vi.advanceTimersByTime(100);
  touch('touchend', source, [], [finger()]);
  const clicked = vi.fn(); source.addEventListener('click', clicked);
  source.click(); expect(clicked).toHaveBeenCalledOnce();
  touch('touchstart');
  expect(touch('touchmove', source, [finger(18)]).defaultPrevented).toBe(false);
  vi.advanceTimersByTime(300);
  expect(document.querySelector('.pitch-touch-ghost')).toBeNull();
  expect(move).not.toHaveBeenCalled();
});

test('220ms hold starts drag, prevents scrolling, drops once, and suppresses one click', () => {
  touch('touchstart'); vi.advanceTimersByTime(219);
  expect(document.querySelector('.pitch-touch-ghost')).toBeNull();
  vi.advanceTimersByTime(1);
  expect(document.querySelector('.pitch-touch-ghost')).not.toBeNull();
  expect(touch('touchmove', source, [finger(80)]).defaultPrevented).toBe(true);
  expect(target.classList.contains('is-drop-target')).toBe(true);
  touch('touchend', source, [], [finger(80)]);
  expect(move).toHaveBeenCalledExactlyOnceWith(source, target);
  expect(document.querySelector('.pitch-touch-ghost')).toBeNull();
  const clicked = vi.fn(); target.addEventListener('click', clicked);
  target.click(); expect(clicked).not.toHaveBeenCalled();
  target.click(); expect(clicked).toHaveBeenCalledOnce();
});

test('locked cards, toolbar buttons and multi-touch never start dragging', () => {
  entry.isLocked = true; touch('touchstart'); vi.advanceTimersByTime(220);
  expect(document.querySelector('.pitch-touch-ghost')).toBeNull();
  entry.isLocked = false; touch('touchstart', source.querySelector('button')); vi.advanceTimersByTime(220);
  expect(document.querySelector('.pitch-touch-ghost')).toBeNull();
  touch('touchstart'); touch('touchstart', source, [finger(), finger(20, 20, 2)]);
  vi.advanceTimersByTime(220);
  expect(document.querySelector('.pitch-touch-ghost')).toBeNull();
});

test('pinch and cancellation release an active drag; locked destinations cannot receive a drop', () => {
  touch('touchstart'); vi.advanceTimersByTime(220);
  expect(touch('touchmove', source, [finger(), finger(20, 20, 2)]).defaultPrevented).toBe(false);
  expect(document.querySelector('.pitch-touch-ghost')).toBeNull();
  touch('touchstart'); vi.advanceTimersByTime(220); touch('touchcancel');
  expect(move).not.toHaveBeenCalled();
  target.dataset.locked = 'true';
  touch('touchstart'); vi.advanceTimersByTime(220); touch('touchend', source, [], [finger()]);
  expect(move).not.toHaveBeenCalled();
});
