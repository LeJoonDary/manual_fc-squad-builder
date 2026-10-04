// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createCardReviewButtons } from './CardReviewButton.js';
import { createPlayerCard } from './PlayerCard.js';
import { createPitchMiniCard } from './PitchMiniCard.js';

const review = { card_id: 1, youtube_video_id: 'abcdefghijk', title: 'Review' };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(result = { data: [review] }) {
  const query = { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue(result) };
  const db = { from: vi.fn(() => query) };
  const open = vi.fn();
  return { createReviewButton: createCardReviewButtons(db, open), query, db, open };
}

test('batches and deduplicates cards; missing or invalid reviews stay hidden', async () => {
  const { createReviewButton, query } = setup({ data: [review, { card_id: 3, youtube_video_id: 'invalid' }] });
  const buttons = [1, 1, 2, 3].map(id => createReviewButton({ id }));
  expect(buttons.every(button => button.hidden)).toBe(true);
  await tick();
  expect(query.in).toHaveBeenCalledExactlyOnceWith('card_id', ['1', '2', '3']);
  expect(buttons.map(button => button.hidden)).toEqual([false, false, true, true]);
});

test('grid and pitch review buttons bypass card selection and keyboard handlers', async () => {
  const { createReviewButton, open } = setup();
  const activate = vi.fn();
  const card = { id: 1, name: 'Player', overall: 90 };
  const grid = createPlayerCard(card, {
    createReviewButton, onActivate: activate, getCardName: c => c.name,
    getCardRating: c => c.overall, getCardPosition: () => 'ST',
    affiliationCatalog: {}, unwrapRelation: value => value,
    createPlaystyleBadges: () => document.createElement('div'),
  });
  const pitch = createPitchMiniCard(card, [], {}, { createReviewButton });
  const parent = document.createElement('div');
  parent.addEventListener('click', activate);
  parent.addEventListener('keydown', activate);
  parent.addEventListener('pointerdown', activate);
  parent.append(grid, pitch);
  await tick();
  for (const node of [grid, pitch]) {
    const button = node.querySelector('.card-review-button');
    expect(button.hidden).toBe(false);
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    const drag = new Event('dragstart', { bubbles: true, cancelable: true });
    const startDrag = vi.fn();
    parent.addEventListener('dragstart', startDrag);
    button.dispatchEvent(drag);
    expect(drag.defaultPrevented).toBe(true);
    expect(startDrag).not.toHaveBeenCalled();
    button.click();
  }
  expect(activate).not.toHaveBeenCalled();
  expect(open).toHaveBeenCalledTimes(2);
  expect(open).toHaveBeenLastCalledWith(review);
});

test('optional review lookup failure leaves card controls hidden', async () => {
  const { createReviewButton } = setup({ error: new Error('offline') });
  const button = createReviewButton({ id: 1 });
  await tick();
  expect(button.hidden).toBe(true);
});
