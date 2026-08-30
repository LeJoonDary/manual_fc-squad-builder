type CostCard = { price?: unknown; cost?: unknown };
type CostEntry = { card?: CostCard; isOwned?: boolean } | null | undefined;

export function getCardCoinPrice(card: CostCard | null | undefined): number {
  const rawPrice = card?.price ?? card?.cost ?? 0;
  const price = Number(String(rawPrice).replace(/[^\d.-]/g, ''));
  return Number.isFinite(price) && price > 0 ? price : 0;
}

export function calculateSquadTotalCost(squad: Record<string, CostEntry>): number {
  return Object.values(squad).reduce((total, entry) => (
    total + (entry?.card && !entry.isOwned ? getCardCoinPrice(entry.card) : 0)
  ), 0);
}
