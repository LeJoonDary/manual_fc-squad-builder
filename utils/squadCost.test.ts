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
