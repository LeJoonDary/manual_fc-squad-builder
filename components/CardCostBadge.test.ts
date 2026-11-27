// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { CardCostBadge } from './CardCostBadge';
import { createPlayerCard } from './PlayerCard.js';
import { createExplorePanel } from './ExplorePanel.js';
import { formatCompactCoin, getCardCost } from '../utils/cardCost';
import { calculateSquadTotalCost } from '../utils/squadCost';
import { PLAYER_LIST_SELECT } from '../utils/playerCatalog.js';
import { AUTO_BUILD_CANDIDATE_SELECT } from '../utils/autoBuildUtils';

test.each([[1250000, '1.25M'], [1000000, '1M'], [99570, '99.6K'], [335400, '335.4K'], [80000, '80K'], [999, '999']])('formats %s coins as %s', (value, expected) => {
  expect(formatCompactCoin(value as number)).toBe(expected);
});

test.each([
  [{ card_type: 'SPECIAL_TOKEN' }, 'token', 'TOKEN'],
  [{ token_cost: 300, sbc_price: 99570 }, 'token', 'TOKEN · 300'],
  [{ card_type: 'SPECIAL_SBC', sbc_price: null }, 'sbc', 'SBC'],
  [{ card_type: 'POTM', sbc_price: 0 }, 'sbc', 'SBC'],
  [{ sbc_price: 99570, season_pass_level: 20 }, 'sbc', 'SBC · 99.6K'],
  [{ season_pass_level: 20, card_type: 'SPECIAL_OBJ' }, 'season', 'SP Lv.20'],
  [{ card_type: 'SPECIAL_SEASON' }, 'season', 'SEASON'],
  [{ card_type: 'SPECIAL_OBJ', price: 100 }, 'objective', 'OBJ'],
  [{ price: 28250 }, 'market', '28,250 C'],
  [{ price: 0 }, 'market', '0 C'],
])('uses acquisition priority for %j', (card, kind, text) => {
  expect(getCardCost(card)).toMatchObject({ kind, text });
});

test('keeps token and SBC costs out of coin totals and includes fields in lean queries', () => {
  expect(calculateSquadTotalCost({ ST: { card: { price: 100, token_cost: 300 } as any }, LW: { card: { price: 0, sbc_price: 99570 } as any } })).toBe(0);
  for (const query of [PLAYER_LIST_SELECT, AUTO_BUILD_CANDIDATE_SELECT]) {
    for (const field of ['sbc_price', 'token_cost', 'season_pass_level', 'card_type']) expect(query).toContain(field);
  }
});

test.each([
  [{ name: 'Batistuta', card_type: 'SPECIAL_SBC', sbc_price: null }, 'SBC'],
  [{ name: 'Batistuta', card_type: 'SPECIAL_SBC', sbc_price: 99570 }, 'SBC · 99.6K'],
  [{ name: 'Moleiro', card_type: 'SPECIAL_TOKEN', token_cost: 300 }, 'TOKEN · 300'],
])('renders %j consistently in presets and selection cards', async (cost, expected) => {
  const card = { id: 1, primary_position: 'ST', price: 0, ...cost };
  const mount = document.createElement('div');
  createExplorePanel({ mount, load: async () => [card], openDetail: vi.fn(), drag: vi.fn(), endDrag: vi.fn(), preset: vi.fn(), close: vi.fn(), name: c => c.name, image: () => '', rating: () => 90 });
  const selection = createPlayerCard(card, { onActivate: vi.fn(), getCardName: c => c.name, getCardRating: () => 90, getCardPosition: () => 'ST', unwrapRelation: v => v, affiliationCatalog: {} });
  await vi.waitFor(() => expect(mount.querySelector('.card-cost')?.textContent).toBe(expected));
  expect(selection.querySelector('.browser-player-price')?.textContent).toBe(expected);
  expect(CardCostBadge({ raw: card }, { compact: true }).textContent).toBe(expected);
  if (cost.card_type === 'SPECIAL_TOKEN') {
    const badge = selection.querySelector('.card-cost')!;
    expect(badge.getAttribute('title')).toBe('Token Store: 300 Tokens');
    expect(badge.querySelectorAll('polygon')).toHaveLength(2);
    expect(badge.querySelector('[id]')).toBeNull();
  }
});
