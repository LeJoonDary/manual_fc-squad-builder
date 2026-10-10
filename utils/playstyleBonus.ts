import { normalizeChemistryPosition } from './chemistry';

export type PlaystyleTier = 'gold' | 'silver' | null;
const PS = { QUICK_STEP: 1, FINESSE: 2, POWER_SHOT: 3, INCISIVE: 4, RAPID: 6,
  TECHNICAL: 7, ANTICIPATE: 8, BRUISER: 10, LONG_BALL: 12, PINGED: 17,
  JOCKEY: 24, TIKI_TAKA: 27, RUSH_OUT: 31, FOOTWORK: 33, LOW_DRIVEN: 37, GAMECHANGER: 38 };

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
  return String(item.playstyle_id ?? item.id ?? join?.id ?? item) === String(id);
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
export function calculatePlaystyleAndSkillBonus(card: any, assignedPosition: string): number {
  const pos = normalizeChemistryPosition(assignedPosition);
  const attacker = ['ST', 'CF', 'LM', 'RM', 'LW', 'RW', 'CAM'].includes(pos);
  const wingerOrST = attacker && pos !== 'CAM';
  const mid = ['CM', 'CDM', 'CAM'].includes(pos);
  let bonus = 0;
  const score = (id: number, gold: number, silver: number) => getPsScore(card, id, gold, silver);
  const stars = (key: string) => {
    const value = sources(card).map(source => source[key]).find(value => value != null && value !== '' && Number.isFinite(Number(value)));
    return value == null ? 3 : Number(value);
  };
  if (attacker) {
    const wf = stars('wf'), sm = stars('sm');
    bonus += wf === 5 ? 16 : wf === 4 ? 8 : wf <= 2 ? -12 : 0;
    bonus += sm === 5 ? 12 : sm === 4 ? 6 : 0;
    for (const id of [PS.GAMECHANGER, PS.LOW_DRIVEN, PS.TECHNICAL]) bonus += score(id, 20, 10);
    bonus += score(PS.FINESSE, 14, 0) + score(PS.POWER_SHOT, 14, 0);
    if (wingerOrST) bonus += score(PS.QUICK_STEP, 16, 8) + score(PS.RAPID, 16, 8);
  }
  if (mid) {
    for (const id of [PS.PINGED, PS.INCISIVE, PS.LONG_BALL]) bonus += score(id, 18, 8);
    bonus += score(PS.TIKI_TAKA, 10, 4);
    // CAM already receives the attacking Power Shot weight; never count it twice.
    if (!attacker) bonus += score(PS.POWER_SHOT, 10, 0);
  }
  if (pos === 'CB') bonus += score(PS.ANTICIPATE, 24, 10) + score(PS.JOCKEY, 14, 6) + score(PS.BRUISER, 14, 6);
  if (['LB', 'RB', 'LWB', 'RWB'].includes(pos)) bonus += score(PS.BRUISER, 12, 6) + score(PS.QUICK_STEP, 12, 6);
  if (pos === 'GK') bonus += score(PS.FOOTWORK, 12, 6) + score(PS.RUSH_OUT, 12, 6);
  return bonus;
}
