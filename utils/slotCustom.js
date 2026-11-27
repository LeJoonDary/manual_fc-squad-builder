import { isHeadshotCard } from './cardPortrait';
import { normalizeChemistryPosition } from './chemistry';
export const CUSTOM_POSITIONS = ['ST','LW','RW','CAM','LM','RM','CM','CDM','LB','CB','RB','GK'];
export const FACE_KEYS = ['pac','sho','pas','dri','def','phy'];
const gkKeys = ['gk_diving','gk_handling','gk_kicking','gk_reflexes','gk_speed','gk_positioning'];
export function sanitizeCustom(value = {}) {
  const result = {};
  if (!value || typeof value !== 'object') return result;
  if (Array.isArray(value.playstyles)) {
    result.playstyles = [...new Map(value.playstyles.filter(style => style && Number.isInteger(style.playstyle_id)
      && style.playstyle_id > 0 && typeof style.name === 'string' && typeof style.is_plus === 'boolean')
      .map(style => {
        const clean = { playstyle_id: style.playstyle_id, name: style.name.slice(0, 120), is_plus: style.is_plus };
        for (const key of ['image_url', 'image_url_plus']) if (typeof style[key] === 'string' && /^(https?:\/\/|\/(?!\/))/.test(style[key])) clean[key] = style[key];
        return [clean.playstyle_id, clean];
      })).values()].sort((a,b) => Number(b.is_plus) - Number(a.is_plus));
  }
  if (value.forceFullChem === true) result.forceFullChem = true;
  if (Array.isArray(value.addedPositions)) {
    const positions = [...new Set(value.addedPositions.filter(p => CUSTOM_POSITIONS.includes(p)))];
    if (positions.length) result.addedPositions = positions;
  }
  if (typeof value.backgroundUrl === 'string' && /^https?:\/\//i.test(value.backgroundUrl)) {
    result.backgroundUrl = value.backgroundUrl;
    if (typeof value.versionLabel === 'string') result.versionLabel = value.versionLabel.slice(0, 120);
  }
  for (const key of ['overall','sm','wf']) if (Number.isFinite(value[key])) result[key] = Math.max(1, Math.min(key === 'overall' ? 99 : 5, Math.round(value[key])));
  for (const key of FACE_KEYS) if (Number.isFinite(value.faceStats?.[key])) {
    (result.faceStats ??= {})[key] = Math.max(1, Math.min(99, Math.round(value.faceStats[key])));
  }
  return result;
}
export const hasCustom = value => Object.keys(sanitizeCustom(value)).length > 0;
export function applySlotCustom(original, value) {
  const custom = sanitizeCustom(value);
  if (!hasCustom(custom)) return original;
  const card = { ...original, originalHeadshot: isHeadshotCard(original), forceFullChem: custom.forceFullChem === true };
  if (custom.playstyles) {
    card.customPlaystyles = custom.playstyles;
    card.playstyles = custom.playstyles;
    card.card_playstyles = custom.playstyles;
  }
  for (const key of ['overall','sm','wf']) if (custom[key] != null) card[key] = custom[key];
  if (custom.backgroundUrl) { card.background_url = custom.backgroundUrl; card.raw = { ...original.raw, background_url: custom.backgroundUrl }; }
  if (custom.versionLabel) card.version = custom.versionLabel;
  const positions = custom.addedPositions ?? [];
  card.secondary_positions = [...new Set([...(original.secondary_positions ?? []), ...(original.altPositions ?? []), ...positions])];
  card.altPositions = card.secondary_positions;
  card.card_positions = [...(original.card_positions ?? []), ...positions.map(name => ({ is_primary: false, positions: { name } }))];
  const stats = Array.isArray(original.player_stats) ? original.player_stats[0] : original.player_stats;
  card.player_stats = { ...stats, ...custom.faceStats };
  Object.assign(card, custom.faceStats);
  if ((card.primary_position ?? card.position) === 'GK') FACE_KEYS.forEach((key, i) => {
    if (custom.faceStats?.[key] != null) { card[gkKeys[i]] = custom.faceStats[key]; card.player_stats[gkKeys[i]] = custom.faceStats[key]; }
  });
  // Solver/detail adapters may prefer raw DB-shaped data. Keep that view effective too.
  card.raw = { ...original.raw, ...card };
  delete card.raw.raw;
  return card;
}

export function getEffectivePositions(entry) {
  if (!entry?.card) return [];
  const card = entry.originalCard ?? entry.card;
  const sources = [card, card.raw].filter(Boolean);
  const positions = sources.flatMap(source => [source.primary_position, source.position,
    ...['secondary_positions','altPositions','alt_positions','alternative_positions'].flatMap(key => Array.isArray(source[key]) ? source[key] : []),
    ...(source.card_positions ?? []).map(row => (Array.isArray(row.positions) ? row.positions[0] : row.positions)?.name),
  ]);
  return [...new Set([...positions, ...(entry.customOverrides?.addedPositions ?? [])].filter(Boolean).map(normalizeChemistryPosition))];
}
export function canMovePitchEntry(squad, origin, target) {
  if (!origin || origin === target || !squad[origin]?.card || squad[origin].isLocked === true || squad[target]?.isLocked === true) return false;
  if (!getEffectivePositions(squad[origin]).includes(normalizeChemistryPosition(target))) return false;
  return !squad[target]?.card || getEffectivePositions(squad[target]).includes(normalizeChemistryPosition(origin));
}
