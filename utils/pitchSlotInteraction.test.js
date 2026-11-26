// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { handlePitchSlotClick } from './pitchSlotInteraction.js';

test('occupied cards open details; toolbar clicks remain independent; empty slots open selection', () => {
  const slot = document.createElement('button');
  const body = document.createElement('span');
  const search = document.createElement('button');
  const open = vi.fn();
  const details = vi.fn();
  let entry = { card: { id: 1 } };
  slot.append(body, search);
  slot.addEventListener('click', event => handlePitchSlotClick(event, {
    entry, suppressed: false, locked: false, open, details,
  }));
  search.addEventListener('click', event => { event.stopPropagation(); details(); });
  body.click();
  slot.click();
  expect(open).not.toHaveBeenCalled();
  expect(details).toHaveBeenCalledTimes(2);
  search.click();
  expect(details).toHaveBeenCalledTimes(3);
  expect(open).not.toHaveBeenCalled();
  entry = null;
  slot.click();
  expect(open).toHaveBeenCalledExactlyOnceWith(slot);
});

test('click suppression after dragging and locked slots still block selection', () => {
  const open = vi.fn();
  for (const flags of [{ suppressed: true }, { locked: true }]) {
    handlePitchSlotClick({ currentTarget: document.createElement('button') }, { ...flags, open });
  }
  expect(open).not.toHaveBeenCalled();
});
