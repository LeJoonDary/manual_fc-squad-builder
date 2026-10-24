// Compatibility adapter; all visual markup lives in the master component.
import { PlayerCard } from './PlayerCard.tsx';

export function createCardFace(card, options = {}) {
  return PlayerCard({ card, ...options });
}
