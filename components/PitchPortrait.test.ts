// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createPitchMiniCard } from './PitchMiniCard.tsx';
import { PlayerCard } from './PlayerCard.tsx';
import { AUTO_BUILD_CANDIDATE_SELECT } from '../utils/autoBuildUtils';
import { createSquadEntry } from '../utils/squadLock';

test.each([
  ['special_base_icon', true], ['special_base_hero', true], ['special_base_hall_of_fut', true],
  ['special_hall_of_fut', true], ['special_base_hall_of_fut_promo', true],
  ['gold', true], ['silver', true], ['bronze', true], ['  GOLD  ', true],
  ['special_future_icon', false], ['special_future_hero', false],
  ['special_base_icon_promo', true], ['special_base_hero_promo', true],
  ['special_world_tour', false], ['', false], [undefined, false],
])('portrait layout for %s is consistent on master and pitch cards', (version, headshot) => {
  const card = { version, image_url: '/player.png' };
  for (const node of [PlayerCard({ card }), createPitchMiniCard(card)]) {
    const portrait = node.querySelector('.ea-card-portrait')!;
    expect(portrait.classList.contains('ea-card-portrait--headshot')).toBe(headshot);
    expect(portrait.getAttribute('loading')).toBe('eager');
    expect(portrait.getAttribute('decoding')).toBe('async');
    expect(portrait.getAttribute('fetchpriority')).toBe('high');
  }
});

test.each([
  ['SPECIAL_HEADSHOT', true], ['special_headshot', true], ['HEADSHOT', true],
  ['SPECIAL', false], [undefined, false], [null, false], [123, false],
])('DB card type %s selects the same portrait layout on both surfaces', (card_type, headshot) => {
  const card = { version: 'special_world_tour', card_type, image_url: '/player.png' };
  for (const node of [PlayerCard({ card }), createPitchMiniCard(card)]) {
    expect(node.querySelector('.ea-card-portrait')!.classList.contains('ea-card-portrait--headshot')).toBe(headshot);
  }
});

test('solver query requests the card portrait, not just playstyle images', () => {
  const cardFields = AUTO_BUILD_CANDIDATE_SELECT.split('players!inner')[0].split(',').map(field => field.trim());
  expect(cardFields).toContain('image_url');
});

test('slot portrait is created synchronously with priority hints before src', () => {
  const card = { id: 1, name: 'Player', image_url: '/portrait.png' };
  const entry = createSquadEntry(card.id, card, {});
  const original = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
  const requests: string[][] = [];
  const setter = vi.spyOn(HTMLImageElement.prototype, 'src', 'set').mockImplementation(function (this: HTMLImageElement, url) {
    requests.push([url, this.getAttribute('loading')!, this.getAttribute('fetchpriority')!]);
    original.set!.call(this, url);
  });
  try {
    const node = createPitchMiniCard(entry.card);
    expect(node.querySelector('.ea-card-portrait')?.getAttribute('src')).toBe(card.image_url);
    expect(requests).toEqual([[card.image_url, 'eager', 'high']]);
  } finally {
    setter.mockRestore();
  }
});

test('missing portraits are omitted and shared portraits fade in after load', () => {
  expect(createPitchMiniCard({ name: 'No photo' }).querySelector('.ea-card-portrait')).toBeNull();
  const portrait = PlayerCard({ card: { image_url: '/catalog.png' } }).querySelector('.ea-card-portrait');
  expect(portrait?.getAttribute('fetchpriority')).toBe('high');
  expect(portrait?.getAttribute('decoding')).toBe('async');
  expect(portrait?.classList.contains('is-loading')).toBe(true);
  portrait!.dispatchEvent(new Event('load'));
  expect(portrait?.classList.contains('is-loading')).toBe(false);
});

test('a failed portrait is removed without affecting the card content', () => {
  const node = createPitchMiniCard({ name: 'Player', image_url: '/broken.png' });
  node.querySelector('.ea-card-portrait')!.dispatchEvent(new Event('error'));
  expect(node.querySelector('.ea-card-portrait')).toBeNull();
  expect(node.querySelector('.ea-card-name')?.textContent).toBe('Player');
});
