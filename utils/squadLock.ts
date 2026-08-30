export type LockableSquadEntry<TCard = unknown, TChemistryCard = unknown> = {
  card_id: string | number;
  card: TCard;
  chemistryCard: TChemistryCard;
  isLocked: boolean;
};

export function createSquadEntry<TCard, TChemistryCard>(
  cardId: string | number,
  card: TCard,
  chemistryCard: TChemistryCard,
): LockableSquadEntry<TCard, TChemistryCard> {
  return { card_id: cardId, card, chemistryCard, isLocked: false };
}

export function isSquadSlotLocked(entry: LockableSquadEntry | null | undefined): boolean {
  return entry?.isLocked === true;
}

export function toggleSquadSlotLock(entry: LockableSquadEntry): boolean {
  entry.isLocked = !entry.isLocked;
  return entry.isLocked;
}
