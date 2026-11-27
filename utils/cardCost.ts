import type { CardCostFields } from '../types/cardCost';

export function formatCompactCoin(value: number): string {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(2))}M`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}K`;
  return Math.round(value).toLocaleString('en-US');
}

// Display metadata only: never substitute these costs for the market price.
export function getCardCost(card: CardCostFields & { raw?: CardCostFields }) {
  const value = (key: keyof CardCostFields) => card[key] ?? card.raw?.[key];
  const type = String(value('card_type') ?? '').toUpperCase();
  const tokens = Number(value('token_cost'));
  const sbc = Number(value('sbc_price'));
  const level = Number(value('season_pass_level'));
  if (tokens > 0 || type.includes('TOKEN')) return {
    kind: 'token', text: tokens > 0 ? `TOKEN · ${tokens.toLocaleString('en-US')}` : 'TOKEN',
    title: tokens > 0 ? `Token Store: ${tokens.toLocaleString('en-US')} Tokens` : 'Token Store',
  };
  if (sbc > 0 || /SBC|POTM/.test(type)) return {
    kind: 'sbc', text: sbc > 0 ? `SBC · ${formatCompactCoin(sbc)}` : 'SBC',
    title: sbc > 0 ? `SBC 약 ${sbc.toLocaleString('en-US')} C` : 'SBC',
  };
  if (level > 0 || type.includes('SEASON')) return {
    kind: 'season', text: level > 0 ? `SP Lv.${level}` : 'SEASON', title: '',
  };
  if (type.includes('OBJ')) return { kind: 'objective', text: 'OBJ', title: '' };
  return { kind: 'market', text: `${Number(value('price') ?? 0).toLocaleString('en-US')} C`, title: '' };
}

// Picker budgets only; squad totals continue using market prices.
export function isAcquisitionCard(card: CardCostFields & { raw?: CardCostFields }) {
  return getCardCost(card).kind !== 'market';
}
export function getPickerCost(card: CardCostFields & { raw?: CardCostFields }): number {
  const kind = getCardCost(card).kind;
  if (kind === 'sbc') return Math.max(0, Number(card.sbc_price ?? card.raw?.sbc_price) || 0);
  return kind === 'market' ? Math.max(0, Number(card.price ?? card.raw?.price) || 0) : 0;
}
