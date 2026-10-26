/** @type {Record<number, string>} */
export const PLAYSTYLE_NAMES = {
  1: 'Quick Step', 2: 'Finesse Shot', 3: 'Power Shot', 4: 'Incisive Pass',
  5: 'Whipped Pass', 6: 'Rapid', 7: 'Technical', 8: 'Anticipate',
  9: 'Intercept', 10: 'Bruiser', 11: 'Aerial', 12: 'Long Ball Pass',
  13: 'Trivela', 14: 'Block', 15: 'Far Throw', 16: 'Dead Ball',
  17: 'Pinged Pass', 18: 'Flair', 19: 'First Touch', 20: 'Relentless',
  21: 'Acrobatic', 22: 'Power Header', 23: 'Press Proven', 24: 'Jockey',
  25: 'Chip Shot', 26: 'Cross Claimer', 27: 'Tiki Taka', 28: 'Trickster',
  29: 'Slide Tackle', 30: 'Long Throw', 31: 'Rush Out', 32: 'Deflector',
  33: 'Footwork', 34: 'Far Reach', 35: 'Enforcer', 36: 'Precision Header',
  37: 'Low Driven Shot', 38: 'Gamechanger', 39: 'Aerial Fortress', 40: 'Inventive',
};

export function getPlaystyleName(ps) {
  const relation = value => Array.isArray(value) ? value[0] : value;
  const nested = relation(ps?.playstyle) ?? relation(ps?.playstyles);
  const id = typeof ps === 'number' || typeof ps === 'string'
    ? ps : ps?.playstyle_id ?? ps?.id ?? ps?.playstyleId ?? nested?.id;
  if (PLAYSTYLE_NAMES[Number(id)]) return PLAYSTYLE_NAMES[Number(id)];
  const names = [ps?.name, nested?.name, typeof ps === 'string' && Number.isNaN(Number(ps)) ? ps : null];
  return names.find(name => typeof name === 'string' && name.trim() && !name.includes('?'))?.trim() || 'PlayStyle';
}
