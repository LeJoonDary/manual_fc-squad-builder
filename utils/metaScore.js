const ATTACK_WEIGHTS = { pac: 0.35, sho: 0.35, dri: 0.2, phy: 0.1 };
const MIDFIELD_WEIGHTS = { pas: 0.3, dri: 0.25, def: 0.25, pac: 0.2 };
const DEFENCE_WEIGHTS = { def: 0.4, phy: 0.3, pac: 0.3 };
const WIDE_THREE_BACK_WEIGHTS = { pac: 0.4, pas: 0.25, dri: 0.2, def: 0.15 };

const POSITION_WEIGHTS = {
  ST: ATTACK_WEIGHTS, CF: ATTACK_WEIGHTS, LW: ATTACK_WEIGHTS, RW: ATTACK_WEIGHTS,
  CM: MIDFIELD_WEIGHTS, CAM: MIDFIELD_WEIGHTS, CDM: MIDFIELD_WEIGHTS,
  CB: DEFENCE_WEIGHTS, LB: DEFENCE_WEIGHTS, RB: DEFENCE_WEIGHTS,
  LWB: DEFENCE_WEIGHTS, RWB: DEFENCE_WEIGHTS,
};

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function starBonus(value) {
  const stars = Number(value);
  return stars === 5 ? 4 : stars === 4 ? 2 : 0;
}

/**
 * Score raw player_stats (lowercase stat keys) and card_versions records.
 * Missing/invalid stats contribute zero. Only wf, sm and price are read from
 * the card; overall is never used. Unsupported positions (including GK) throw.
 * Price must be a number or numeric string; missing/non-positive prices yield 0 value.
 */
export function calculate_base_score(player_stats, card_version, target_position, is_three_back) {
  const weights = target_position === 'LM' || target_position === 'RM'
    ? (is_three_back === true ? WIDE_THREE_BACK_WEIGHTS : ATTACK_WEIGHTS)
    : Object.hasOwn(POSITION_WEIGHTS, target_position) ? POSITION_WEIGHTS[target_position] : undefined;

  if (!weights) throw new RangeError(`Unsupported target position: ${target_position}`);

  const baseScore = Object.entries(weights).reduce(
    (score, [stat, weight]) => score + nonNegativeNumber(player_stats?.[stat]) * weight,
    0,
  );
  const meta_score = baseScore + starBonus(card_version?.wf) + starBonus(card_version?.sm);
  const price = nonNegativeNumber(card_version?.price);
  return { meta_score, value_score: price > 0 ? meta_score / price : 0 };
}
