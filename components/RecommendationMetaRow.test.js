// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
vi.mock('./PlayerCard.tsx', () => ({ PlayerCard: () => document.createElement('div') }));
import { createPlayerCard } from './PlayerCard.js';
test.each([89.4, NaN, Infinity, undefined, 'bad'])('meta row safely renders score %s and keeps badge above price', value => {
  const node = createPlayerCard({meta_score:value,price:234000}, {
    onActivate:vi.fn(),getCardName:()=> 'Player',getCardRating:()=>90,getCardPosition:()=> 'CM',
    unwrapRelation:x=>x,synergyBadge:'+2 케미 🔥',
  });
  const row=node.querySelector('.browser-player-meta-row');
  expect(row.firstElementChild.textContent).toBe('+2 케미 🔥');
  expect(row.lastElementChild.textContent).toBe(Number.isFinite(value) ? 'Meta Score 89.4' : 'Meta Score N/A');
  expect(node.textContent).not.toContain('NaN');
  expect(node.textContent).not.toContain('Infinity');
  expect(node.querySelector('.browser-player-footer').children).toHaveLength(1);
  expect(node.querySelector('.browser-player-footer').textContent).toBe('🪙 234,000 C');
});
