export type LockableSquadEntry<TCard = unknown, TChemistryCard = unknown> = {
  card_id: string | number;
  card: TCard;
  chemistryCard: TChemistryCard;
  isLocked: boolean;
  isOwned: boolean;
};

export function createSquadEntry<TCard, TChemistryCard>(
  cardId: string | number,
  card: TCard,
  chemistryCard: TChemistryCard,
): LockableSquadEntry<TCard, TChemistryCard> {
  return { card_id: cardId, card, chemistryCard, isLocked: false, isOwned: false };
}

export function isSquadSlotLocked(entry: LockableSquadEntry | null | undefined): boolean {
  return entry?.isLocked === true;
}

export function toggleSquadSlotLock(entry: LockableSquadEntry): boolean {
  entry.isLocked = !entry.isLocked;
  return entry.isLocked;
}

export function clearUnlockedSquadEntries<TEntry extends LockableSquadEntry>(
  squad: Record<string, TEntry | null | undefined>,
): string[] {
  const clearedSlots: string[] = [];
  Object.entries(squad).forEach(([slotKey, entry]) => {
    if (!entry || isSquadSlotLocked(entry)) return;
    squad[slotKey] = null;
    clearedSlots.push(slotKey);
  });
  return clearedSlots;
}
