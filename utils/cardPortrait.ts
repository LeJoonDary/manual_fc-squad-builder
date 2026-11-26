// Shared by catalog and pitch cards; preserve the base families alongside DB-tagged headshots.
export function isHeadshotCard(card: Record<string, any>): boolean {
  if (typeof card.originalHeadshot === 'boolean') return card.originalHeadshot;
  const version = typeof card.version === 'string' ? card.version.toLowerCase().trim() : '';
  const cardType = typeof card.card_type === 'string' ? card.card_type.toUpperCase().trim() : '';
  return /^(gold|silver|bronze|base)(?:$|[_ -])/.test(version)
    || /^(GOLD|SILVER|BRONZE)(?:$|_)/.test(cardType)
    || version.includes('base_icon')
    || version.includes('base_hero')
    || version.includes('base_hall_of_fut')
    || cardType.includes('HEADSHOT');
}

