import { normalizeChemistryPosition } from './chemistry';

export type PlaystyleTier = 'gold' | 'silver' | null;


function sources(card: any): any[] {
  const result: any[] = [];
  const visit = (value: any) => {
    if (!value || typeof value !== 'object' || result.includes(value)) return;
    result.push(value); visit(value.card); visit(value.raw);
  };
  visit(card);
  return result;
}
function matches(item: any, id: number): boolean {
  if (item == null) return false;
  const join = Array.isArray(item.playstyles) ? item.playstyles[0] : item.playstyles;
  if (String(item.playstyle_id ?? item.id ?? join?.id ?? item) === String(id)) return true;
  const names: Record<number, string> = { 1:'quickstep', 2:'finesse', 3:'powershot', 4:'incisive', 6:'rapid', 7:'technical', 8:'anticipate', 9:'intercept', 10:'bruiser', 12:'longballpass', 17:'pingedpass', 24:'jockey', 27:'tikitaka', 31:'rushout', 33:'footwork', 37:'lowdriven', 38:'gamechanger' };
  const name = String(item.name ?? join?.name ?? (typeof item === 'string' ? item : '')).toLowerCase().replace(/[^a-z]/g, '');
  return Boolean(names[id] && name.includes(names[id]));
}
/** Gold wins across all input representations; duplicate rows never multiply a bonus. */
export function getPlaystyleTier(card: any, psId: number): PlaystyleTier {
  let silver = false;
  for (const source of sources(card)) {
    for (const list of [source.playstylesPlus, source.playstyles_plus]) {
      if (Array.isArray(list) && list.some(item => matches(item, psId))) return 'gold';
    }
    for (const list of [source.playstyles, source.card_playstyles]) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (!matches(item, psId)) continue;
        if (item?.is_plus === true || item?.isPlus === true) return 'gold';
        silver = true;
      }
    }
  }
  return silver ? 'silver' : null;
}
export function getPsScore(card: any, psId: number, goldPts: number, silverPts: number): number {
  const tier = getPlaystyleTier(card, psId);
  return tier === 'gold' ? goldPts : tier === 'silver' ? silverPts : 0;
}
// [playstyle ID, gold points, silver points]. Unlisted traits award no points.
const TABLES: Record<string, number[][]> = {
  ST: [[3,3,0],[7,4,2],[38,4,2],[37,4,2],[2,3,0],[1,3,1.5],[6,3,1.5],[27,2,1],[4,2,1],[17,2,1]],
  CAM: [[3,3,0],[4,4,2],[17,4,2],[7,4,2],[12,3.5,1.8],[38,2.5,1.3],[37,2.5,1.3],[27,2,1],[2,2,0]],
  CM: [[3,3,0],[4,4,2],[17,4,2],[12,3.5,1.8],[7,3,1.5],[27,3,1.5],[9,2.5,1.3],[8,2.5,1.3],[24,2.5,1.3],[1,2.5,1.3]],
  CB: [[8,4,2],[10,3,1.5],[24,3.5,1.8],[9,2,1]],
  LB: [[1,3.5,1.8],[6,3.5,1.8],[10,3,1.5],[9,3,1.5],[8,3,1.5]],
  GK: [[33,3,1.5],[31,3,1.5]],
};
export function calculatePlaystyleAndSkillBonus(card: any, assignedPosition: string): number {
  const pos = normalizeChemistryPosition(assignedPosition);
  const stars = (...keys: string[]) => {
    for (const key of keys) for (const source of sources(card)) {
      const value = source[key];
      if (value != null && value !== '' && Number.isFinite(Number(value))) return Number(value);
    }
    return 3;
  };
  const wf = stars('weak_foot', 'wf');
  const bonus = (wf === 5 ? 5 : wf === 4 ? 2.5 : 0);
  const group = pos === 'CF' ? 'ST' : pos === 'CDM' ? 'CM' : ['RB','LWB','RWB'].includes(pos) ? 'LB' : pos;
  return bonus + (TABLES[group] ?? []).reduce((sum, [id, gold, silver]) => sum + getPsScore(card, id, gold, silver), 0);
}
