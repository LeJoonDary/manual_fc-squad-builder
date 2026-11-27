import { getEffectiveMarketPrice, type MarketCostCard } from './cardCost';
type CostEntry = { card?: MarketCostCard; isOwned?: boolean } | null | undefined;

export const getCardCoinPrice = getEffectiveMarketPrice;

export function calculateSquadTotalCost(squad: Record<string, CostEntry>): number {
  return Object.values(squad).reduce((total, entry) => (
    Math.min(Number.MAX_VALUE, total + (getCardCoinPrice(entry?.card, entry?.isOwned)))
  ), 0);
}
