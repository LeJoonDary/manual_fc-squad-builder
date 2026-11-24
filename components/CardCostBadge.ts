import type { CardCostFields } from '../types/cardCost';
import { getCardCost } from '../utils/cardCost';
import { TokenIcon } from './TokenIcon';

export function CardCostBadge(card: CardCostFields & { raw?: CardCostFields }, { coinIcon = false, compact = false } = {}) {
  const cost = getCardCost(card);
  const badge = document.createElement('span');
  badge.className = `card-cost card-cost--${cost.kind}${compact ? ' card-cost--compact' : ''}`;
  if (cost.title) badge.title = cost.title;
  if (cost.kind === 'token') badge.append(TokenIcon());
  else if (cost.kind === 'market' && coinIcon) {
    const icon = document.createElement('span');
    icon.className = 'coin-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🪙';
    badge.append(icon, document.createTextNode(' '));
  }
  badge.append(document.createTextNode(cost.text));
  return badge;
}
