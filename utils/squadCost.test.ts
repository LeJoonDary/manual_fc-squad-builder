import { describe, expect, it } from 'vitest';
import { calculateSquadTotalCost } from './squadCost';

describe('calculateSquadTotalCost', () => {
  it('subtracts an owned card price from the total cost', () => {
    const squad = {
      ST: { card: { price: 1_250_000 }, isOwned: false },
      CAM: { card: { price: '750,000' }, isOwned: false },
    };

    expect(calculateSquadTotalCost(squad)).toBe(2_000_000);
    squad.ST.isOwned = true;
    expect(calculateSquadTotalCost(squad)).toBe(750_000);
  });
});
it('never overflows accumulated card costs',()=>{
 expect(calculateSquadTotalCost({ST:{card:{price:Number.MAX_VALUE}},CF:{card:{price:Number.MAX_VALUE}}})).toBe(Number.MAX_VALUE);
 expect(calculateSquadTotalCost({ST:{card:{price:NaN}},CF:{card:{price:Infinity}}})).toBe(0);
});

it('ignores acquisition prices in totals, locked costs and both modal budgets', async () => {
  const { getRemainingAutoBuildBudget, getEmptySlotPriceCap } = await import('./autoBuildUtils');
  const { getEffectiveMarketPrice, getPickerCost } = await import('./cardCost');
  const squad = {
    LW: { card: { price: 9000000, card_type: 'SPECIAL_SBC', sbc_price: 8000000 }, isLocked: true },
    ST: { card: { price: 9000000, card_type: 'SPECIAL_OBJ' }, isLocked: true },
    RW: { card: { price: 9000000, token_cost: 5 }, isLocked: true },
    CM: { card: { price: 10000 }, isLocked: true },
    GK: { card: { price: 500000 }, isOwned: true, isLocked: true },
  };
  expect(calculateSquadTotalCost(squad)).toBe(10000);
  expect(getRemainingAutoBuildBudget(30000, '4-3-3', { currentSquad: squad })).toMatchObject({ lockedCost: 10000, remainingTotalBudget: 20000 });
  for (const mode of ['empty', 'replace'] as const) {
    expect(getEmptySlotPriceCap({ currentSquad: squad, formation: '4-3-3', slotPosition: 'LB', totalBudget: 30000, mode })).toBe(20000);
  }
  for (const entry of [squad.LW, squad.ST, squad.RW]) {
    expect(getPickerCost(entry.card)).toBe(0);
    expect(getEffectiveMarketPrice({ price: 9000000, raw: entry.card })).toBe(0);
  }
  expect(getEffectiveMarketPrice(squad.CM.card, true)).toBe(0);
});
it('keeps locked acquisition cards with stale or missing prices at zero in the solver', async () => {
  const { generateOptimalSquad } = await import('./autoBuildUtils');
  const { createSquadCandidateRows } = await import('../scripts/mocks/squadCandidates.js');
  const { FORMATIONS } = await import('./formations.js');
  const rows = createSquadCandidateRows().filter((_, index) => index % 3 === 0);
  const slots = FORMATIONS.find(item => item.name === '4-3-3')!.slots;
  const currentSquad = Object.fromEntries(slots.map((slot, index) => [slot.position, {
    card: { ...rows[index], card_type: 'SPECIAL_SBC', sbc_price: 9000000, price: index ? 9000000 : null }, isLocked: true,
  }]));
  const result = await generateOptimalSquad('4-3-3', [], 1000, 0, false, { currentSquad });
  expect(result.success).toBe(true);
  expect(result.totalCost).toBe(0);
  expect(result.squad).toHaveLength(11);
  expect(result.squad.every(player => player.price === 0 && player.isLocked)).toBe(true);
});
