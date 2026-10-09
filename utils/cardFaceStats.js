const relation = value => (Array.isArray(value) ? value[0] : value) ?? {};
export function getCardFaceStats(card, position) {
  const sources = [card, card.face_stats, card.stats, relation(card.player_stats), card.raw,
    relation(card.raw?.player_stats), relation(card.raw?.players)].filter(Boolean);
  const isGK = [position, card.position, card.assignedPosition, card.primary_position, card.raw?.position].includes('GK');
  const labels = isGK ? ['DIV', 'HAN', 'KIC', 'REF', 'SPD', 'POS'] : ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'];
  const keys = [['pac', 'pace', 'facePace'], ['sho', 'shooting'], ['pas', 'passing'], ['dri', 'dribbling'], ['def', 'defending'], ['phy', 'physicality']];
  const gk = [['gk_diving', 'attributeGkDiving'], ['gk_handling', 'attributeGkHandling'],
    ['gk_kicking', 'attributeGkKicking'], ['gk_reflexes', 'attributeGkReflexes'],
    ['gk_speed', 'gkFaceSpeed', 'sprint_speed', 'attributeSprintSpeed'], ['gk_positioning', 'attributeGkPositioning']];
  return labels.map((label, i) => {
    for (const key of (isGK ? gk[i] : keys[i])) {
      for (const source of sources) if (source[key] != null && source[key] !== '') return [label, source[key]];
    }
    return [label, 0];
  });
}
