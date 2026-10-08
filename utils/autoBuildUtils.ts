import { calculateChemistry } from './chemistry.ts';
import type { PlayerCard, SquadSlot } from '../types/chemistry';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adaptChemistryPlayerCard, isPositionMatched, normalizeChemistryPosition } from './chemistry.ts';
import { FORMATIONS } from './formations.js';
import { getCardCoinPrice, calculateSquadTotalCost } from './squadCost.ts';
import { getCardVersionId, normalizeExcludedCardVersionIds, validateSquadOvrRange } from './excludedCardVersions.js';

export interface PlaystyleReqItem { id: number; name: string; isPlus: boolean; }
export interface RoleReqItem { name: string; minLevel: 1 | 2; }
export interface SlotRequirement {
  roles?: RoleReqItem[];
  playstyles?: PlaystyleReqItem[];
  role?: { name: string; minLevel: 1 | 2 };
  playstyle?: { idOrName: string | number; isPlus: boolean };
}
export interface AutoBuildOptions {
  slotRequirements?: Record<string, SlotRequirement>;

  excludeZeroPriceCards?: boolean;
  squadOvrRange?: { min: number; max: number };
  /** card_versions.id values: other versions of the same player remain eligible. */
  excludedCardVersionIds?: Array<string | number>;
  focus?: SquadFocus;
  isStrictRoleMode?: boolean;
  roleRequirementsBySlot?: boolean;
  slotRoleRequirements?: Record<string, { roleName: string; minLevel: 1 | 2 }>;
  currentSquad?: Record<string, { card: Record<string, any>; isOwned?: boolean; isLocked?: boolean } | null>;
  /** Combined Icon/Hero maximum. null/undefined means unlimited (11). */
  maxSpecialCards?: number | null;
}
function specialLimit(options: AutoBuildOptions): number {
  const limit = options.maxSpecialCards ?? 11;
  if (!Number.isInteger(limit) || limit < 0 || limit > 11) throw new RangeError('Icon / Hero Limit must be between 0 and 11.');
  return limit;
}
function passesMarketPriceFilter(card: Record<string, any>, options: AutoBuildOptions): boolean {
  return options.excludeZeroPriceCards !== true || (card.price != null && Number.isFinite(Number(card.price)) && Number(card.price) > 0);
}
function rawEntryCard(entry: NonNullable<NonNullable<AutoBuildOptions['currentSquad']>[string]>) {
  return entry.card.raw ?? entry.card;
}
function exclusionSet(options: AutoBuildOptions, formation: string): Set<string> {
  const excluded = new Set<string>(normalizeExcludedCardVersionIds(options.excludedCardVersionIds));
  const slots = FORMATIONS.find(item => item.name === formation)?.slots ?? [];
  for (const { position } of slots) {
    const entry = options.currentSquad?.[position];
    if (entry?.isLocked && excluded.has(getCardVersionId(entry.card))) {
      throw new Error('An excluded card is locked in your squad. Unlock it or remove its exclusion, then try again.');
    }
  }
  return excluded;
}
function isSpecialCard(card: Record<string, any>): boolean {
  const type = String(card.card_type ?? card.cardType ?? '').toUpperCase();
  return type ? ['ICON', 'SPECIAL_ICON', 'HERO', 'SPECIAL_HERO'].includes(type) : Boolean(card.isIcon || card.isHero);
}

export type BudgetGroup = 'FW' | 'MF' | 'DF';
export type SquadFocus = 'attack' | 'balanced' | 'defense';
const CANDIDATE_LIMITS = { FW: 120, MF: 120, DF: 120 };
// Explicit solver and pitch display fields; omit full card-detail joins.
export const AUTO_BUILD_CANDIDATE_SELECT = `
  id,player_id,overall,price,version,card_type,club_id,league_id,background_url,sm,wf,preferred_foot,body_type,
  players!inner(id,name,long_name,nation_id,gender,height,nations(name,flag_url)),
  clubs(id,name),leagues(id,name),card_positions(is_primary,positions(name)),
  card_roles(role_level,roles(position,role_name)),
  card_playstyles(playstyle_id,is_plus,playstyles(id,name)),
  player_stats(pac,sho,pas,dri,def,phy,acceleration,sprint_speed,agility,balance,
    finishing,composure,def_awareness,standing_tackle,strength,stamina,vision,short_passing,jumping)
`;

export function getPositionBudgetGroup(position: string, isThreeBack: boolean): BudgetGroup {
  const normalized = normalizeChemistryPosition(position);
  if (['ST', 'CF', 'LW', 'RW', 'CAM'].includes(normalized)) return 'FW';
  if (['LM', 'RM'].includes(normalized)) return isThreeBack ? 'MF' : 'FW';
  if (['CM', 'CDM'].includes(normalized)) return 'MF';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB', 'GK'].includes(normalized)) return 'DF';
  throw new Error(`Unsupported position: ${position}`);
}

/** Reserve locked purchases before spending the shared balance on open slots. */
export function getRemainingAutoBuildBudget(totalBudget: number | null | undefined, formation: string, options: AutoBuildOptions = {}) {
  totalBudget = totalBudget ?? 0;
  if (!Number.isFinite(totalBudget) || totalBudget < 0) throw new RangeError('Total budget must be a finite number of 0 or more.');
  const layout = FORMATIONS.find(item => item.name === formation);
  if (!layout) throw new Error(`Unsupported formation: ${formation}`);
  const lockedCost = layout.slots.reduce((sum, slot) => {
    const entry = options.currentSquad?.[slot.position];
    return sum + (entry?.isLocked && !entry.isOwned ? getCardCoinPrice(rawEntryCard(entry)) : 0);
  }, 0);
  const unlimited = totalBudget === 0;
  // Unlimited has no finite remaining amount to display; the solver uses Infinity.
  return { lockedCost, unlimited, remainingTotalBudget: unlimited ? Infinity : totalBudget - lockedCost,
    distributableBudget: unlimited ? 0 : Math.max(0, totalBudget - lockedCost) };
}

const FOCUS_PRIORITIES: Record<SquadFocus, string[]> = {
  attack: ['ST', 'CF', 'CAM', 'LW', 'RW', 'LM', 'RM', 'CB', 'CM', 'CDM', 'LB', 'RB', 'LWB', 'RWB', 'GK'],
  defense: ['CB', 'CDM', 'CM', 'ST', 'CF', 'LB', 'RB', 'LWB', 'RWB', 'CAM', 'LW', 'RW', 'LM', 'RM', 'GK'],
  balanced: ['ST', 'CB', 'CM', 'CDM', 'CF', 'CAM', 'LW', 'RW', 'LM', 'RM', 'LB', 'RB', 'LWB', 'RWB', 'GK'],
};
function validateFocus(focus: SquadFocus) {
  if (!Object.hasOwn(FOCUS_PRIORITIES, focus)) throw new RangeError('Unknown squad focus.');
}

/** Slot aliases share their canonical position's weight, order and price ceiling. */
export function getFocusWeight(position: string, focus: SquadFocus = 'attack'): number {
  validateFocus(focus);
  const normalized = normalizeChemistryPosition(position);
  if (focus === 'attack') {
    if (['ST', 'CF'].includes(normalized)) return 1.3;
    if (['LW', 'RW', 'CAM', 'LM', 'RM'].includes(normalized)) return 1.2;
  } else if (focus === 'defense') {
    if (normalized === 'CB') return 1.3;
    if (['CDM', 'CM'].includes(normalized)) return 1.2;
  }
  return 1;
}

export function getSlotEvaluationOrder(focus: SquadFocus, positions: readonly string[]): string[] {
  validateFocus(focus);
  const priority = FOCUS_PRIORITIES[focus];
  const rank = (position: string) => {
    const index = priority.indexOf(normalizeChemistryPosition(position));
    return index < 0 ? priority.length : index;
  };
  return [...positions].sort((a, b) => rank(a) - rank(b));
}

function getBaseSlotPrice(position: string, focus: SquadFocus, targetBudget: number, remainingBudget: number): number {
  validateFocus(focus);
  if (!Number.isFinite(targetBudget) || targetBudget < 0) throw new RangeError('Budget must be 0 or more.');
  // Preserve the existing zero-budget/unset-budget meaning: unlimited spending.
  if (targetBudget === 0) return Math.max(0, remainingBudget);
  const normalized = normalizeChemistryPosition(position);
  let ratio = .5;
  if (focus === 'attack') {
    if (normalized === 'ST') ratio = .35;
    else if (normalized === 'CF') ratio = .55;
    else if (['LW', 'RW'].includes(normalized)) ratio = .20;
    else if (['CAM', 'LM', 'RM'].includes(normalized)) ratio = .4;
    else if (['CM', 'CDM'].includes(normalized)) ratio = .12;
    else if (normalized === 'GK') return Math.max(0, Math.min(15000, remainingBudget));
    else if (['LB', 'RB', 'LWB', 'RWB'].includes(normalized)) return Math.max(0, Math.min(20000, remainingBudget));
  } else if (focus === 'defense') {
    if (normalized === 'CB') ratio = .45;
    else if (['CM', 'CDM'].includes(normalized)) ratio = .35;
    else if (['LB', 'RB', 'LWB', 'RWB'].includes(normalized)) ratio = .12;
    else ratio = .25;
  } else {
    ratio = ['LB', 'RB', 'LWB', 'RWB', 'GK'].includes(normalized) ? .09 : .3;
  }
  return Math.max(0, Math.min(Math.floor(targetBudget * ratio), remainingBudget));
}

/** Elastic ceilings never manufacture coins when the balance is below the reserve. */
export function getElasticSlotCap(targetPos: string, slotBaseBudget: number, currentRemainingBudget: number, remainingSlotsCount: number): number {
  const pos = normalizeChemistryPosition(targetPos);
  const multiplier = ['ST', 'CF', 'LW', 'RW', 'LM', 'RM', 'CAM'].includes(pos) ? 1.7
    : pos === 'CB' ? 1.4 : ['CM', 'CDM'].includes(pos) ? 1 : .85;
  return Math.max(0, Math.min(Math.floor(slotBaseBudget * multiplier),
    currentRemainingBudget - Math.max(0, remainingSlotsCount) * 1000));
}

export function getMaxSlotPrice(position: string, focus: SquadFocus, targetBudget: number, remainingBudget: number, remainingSlotsCount = 0): number {
  const base = getBaseSlotPrice(position, focus, targetBudget, Infinity);
  if (targetBudget === 0) return Math.max(0, remainingBudget);
  const pos = normalizeChemistryPosition(position);
  const ratio = pos === 'CB' ? (focus === 'attack' ? .20 : focus === 'defense' ? .45 : .30) : ['LB', 'RB', 'LWB', 'RWB', 'GK'].includes(pos) ? .08 : null;
  if (ratio !== null) return Math.max(0, Math.min(Math.floor(targetBudget * ratio), remainingBudget - Math.max(0, remainingSlotsCount) * 1000));
  return getElasticSlotCap(position, base, remainingBudget, remainingSlotsCount);
}

export type CandidatePlayer = Record<string, unknown> & {
  id: string | number;
  candidateGroups: BudgetGroup[];
};

/**
 * Returns raw UI-compatible card_versions rows, retaining full card_positions and relations.
 * candidateGroups identifies eligible positions, without partitioning purchase funds.
 * One bounded query per distinct position retains at most 120 market candidates.
 * All positions share the total balance left after locked purchases.
 * Price 0 is allowed only when its exclusion toggle is off; null/negative prices are excluded.
 */
export async function fetchCandidatePlayers(
  totalBudget: number | null | undefined, formation: string,
  isThreeBack: boolean, supabase: SupabaseClient,
  options: AutoBuildOptions = {},
): Promise<CandidatePlayer[]> {
  const { remainingTotalBudget, unlimited } = getRemainingAutoBuildBudget(totalBudget, formation, options);
  const focus = options.focus ?? 'attack';
  validateFocus(focus);
  if (isThreeBack !== formation.startsWith('3')) throw new Error('Formation does not match the isThreeBack setting.');
  const openSlots = FORMATIONS.find(layout => layout.name === formation)!.slots.filter(slot => !options.currentSquad?.[slot.position]?.isLocked);
  const plan = (['FW', 'MF', 'DF'] as BudgetGroup[]).map(group => ({ group, limit: CANDIDATE_LIMITS[group],
    positions: [...new Set(openSlots.filter(slot => getPositionBudgetGroup(slot.position, isThreeBack) === group)
      .map(slot => normalizeChemistryPosition(slot.position)))] }));
  const excluded = exclusionSet(options, formation);
  const squadOvrRange = validateSquadOvrRange(options.squadOvrRange);
  const maxSpecial = specialLimit(options);
  const entries = Object.entries(options.currentSquad ?? {}).filter(([, entry]) => entry?.card);
  const locked = entries.filter(([, entry]) => entry!.isLocked);
  const lockedSpecial = locked.filter(([, entry]) => isSpecialCard(rawEntryCard(entry!))).length;
  if (lockedSpecial > maxSpecial) throw new Error('Locked Icons / Heroes exceed the limit. Unlock players or increase the limit.');
  if (!supabase) throw new Error('Supabase connection is not configured.');
  // A separate inner-join alias filters parents without truncating the full position list.
  const select = `${AUTO_BUILD_CANDIDATE_SELECT}, candidate_positions:card_positions!inner(positions!inner(name))`;
  const results = await Promise.all(plan.map(async item => {
    if (!item.positions.length) return { group: item.group, rows: [] };
    const queryRows = async (cap: number | null, limit: number, cheapest = false, positions = item.positions, roleSlot = positions[0], req?: { roleName: string; minLevel: 1 | 2 }) => {
      const styles = requiredPlaystyles(options.slotRequirements?.[roleSlot]);
      const projection = select + (req ? ', required_roles:card_roles!inner(role_level,roles!inner(position,role_name))' : '')
        + styles.map((_, index) => ', ' + styleAlias(index) + ':card_playstyles!inner(is_plus,playstyles!inner(id,name))').join('');
      let query = supabase.from('card_versions').select(projection)
        .in('candidate_positions.positions.name', positions)
        .gte('overall', Math.max(80, squadOvrRange.min)).lte('overall', squadOvrRange.max).gte('price', 0);
      if (req) query = query.eq('required_roles.roles.position', positions[0])
        .eq('required_roles.roles.role_name', req.roleName).gte('required_roles.role_level', req.minLevel);
      for (const [index, ps] of styles.entries()) {
        const field = typeof ps.idOrName === 'number' || /^\d+$/.test(String(ps.idOrName)) ? 'id' : 'name';
        query = query.eq(styleAlias(index) + '.playstyles.' + field, ps.idOrName);
        if (ps.isPlus) query = query.eq(styleAlias(index) + '.is_plus', true);
      }
      if (options.excludeZeroPriceCards === true) query = query.gt('price', 0);
      if (excluded.size) query = query.not('id', 'in', `(${[...excluded].join(',')})`);
      if (cap !== null) query = query.lte('price', cap);
      if (lockedSpecial >= maxSpecial) query = query.or('card_type.is.null,card_type.not.in.(ICON,SPECIAL_ICON,HERO,SPECIAL_HERO)');
      if (cheapest) query = query.order('price', { ascending: true });
      query = query.order('overall', { ascending: false, nullsFirst: false });
      query = query.order('id', { ascending: true });
      const { data, error } = await query.limit(Math.min(limit, item.limit));
      if (error) throw new Error(item.group + ' candidate search failed: ' + error.message, { cause: error });
      return data ?? [];
    };
    const roleSlots = (options.roleRequirementsBySlot || options.slotRequirements) ? openSlots.filter(slot => item.positions.includes(normalizeChemistryPosition(slot.position))).map(slot => slot.position) : item.positions;
    const uniqueRoleSlots = [...new Map(roleSlots.map(slot => [
      JSON.stringify([normalizeChemistryPosition(slot), slotRequirement(slot, options)]), slot,
    ])).values()];
    const perPosition = await Promise.all(uniqueRoleSlots.map(async slot => {
      const position = normalizeChemistryPosition(slot);
      const roles = requiredRoles(slotRequirement(slot, options));
      // Each alternative gets its own filtered query before LIMIT; union implements OR.
      const alternatives = roles.length ? roles : [undefined];
      const rows = await Promise.all(alternatives.map(role => queryRows(
        unlimited ? null : getMaxSlotPrice(position, focus, totalBudget ?? 0, remainingTotalBudget),
        120, false, [position], slot, role ? { roleName: role.name, minLevel: role.minLevel } : undefined)));
      return rows.flat();
    }));
    return { group: item.group, rows: [...new Map(perPosition.flat().map(row => [row.id, row])).values()] };

  }));
  const candidates = new Map<string, CandidatePlayer>();
  for (const { group, rows } of results) {
    for (const row of rows) {
      if (excluded.has(getCardVersionId(row)) || !passesMarketPriceFilter(row, options)) continue;
      const { candidate_positions: _matchedPositions, ...card } = row;
      const existing = candidates.get(String(card.id));
      if (existing) existing.candidateGroups.push(group);
      else candidates.set(String(card.id), { ...card, candidateGroups: [group] } as CandidatePlayer);
    }
  }
  // Owned cards bypass market-price pruning, including cards absent from the DB top-N.
  for (const [, entry] of entries) {
    if (!entry!.isOwned) continue;
    const card = rawEntryCard(entry!);
    if (!passesMarketPriceFilter(card, options)) continue;
    if (excluded.has(getCardVersionId(card)) || card.overall == null || card.overall < squadOvrRange.min || card.overall > squadOvrRange.max) continue;
    if (isSpecialCard(card) && lockedSpecial >= maxSpecial && !entry!.isLocked) continue;
    const candidateGroups = plan.filter(item => item.positions.some(position => prepareCandidate(card, position, isThreeBack, true))).map(item => item.group);
    candidates.set(String(card.id), { ...card, candidateGroups, isOwned: true } as CandidatePlayer);
  }
  return [...candidates.values()].sort((a, b) => Number(b.overall ?? 0) - Number(a.overall ?? 0));
}

export type AutoBuildPlayer = PlayerCard & { slotPosition?: string };

export interface BestManagerResult {
  bestLeagueId: PlayerCard['leagueId'] | null;
  bestNationId: PlayerCard['nationId'] | null;
  maxChemistry: number;
  addedChemistry: number;
}

function uniqueAffiliations(ids: Array<number | string>): Array<number | string> {
  const unique = new Map<string, number | string>();
  for (const id of ids) {
    if (id == null) continue;
    const key = String(id).normalize('NFKC').trim().toLocaleLowerCase('en-US');
    if (key && !unique.has(key)) unique.set(key, id);
  }
  return [...unique.values()];
}

/**
 * Simulates every represented league/nation combination using the UI's calculator.
 * Pass chemistry PlayerCards (adapt raw DB cards with adaptChemistryPlayerCard first).
 * IDs are returned unchanged, including canonical keys produced by that adapter.
 * slotPosition is the assigned formation slot; omitted means the primary position.
 * Ties keep the first combination in player order. Missing affiliations return null.
 * addedChemistry compares against the same squad with no manager.
 */
export function findBestManager(players: readonly AutoBuildPlayer[]): BestManagerResult {
  if (players.length > 11) throw new RangeError('A squad can contain at most 11 players.');

  const squad: SquadSlot[] = players.map(player => ({
    position: player.slotPosition ?? player.position,
    player,
  }));
  const baseline = calculateChemistry(squad).totalChemistry;
  const leagues = uniqueAffiliations(players.map(player => player.leagueId));
  const nations = uniqueAffiliations(players.map(player => player.nationId));
  let best: BestManagerResult | undefined;

  // A missing dimension must not prevent a useful bonus from the other one.
  for (const leagueId of leagues.length ? leagues : [null]) {
    for (const nationId of nations.length ? nations : [null]) {
      const manager = {
        leagueId: leagueId ?? undefined,
        nationId: nationId ?? undefined,
      };
      const total = calculateChemistry(squad, manager).totalChemistry;
      if (!best || total > best.maxChemistry) {
        best = {
          bestLeagueId: leagueId,
          bestNationId: nationId,
          maxChemistry: total,
          addedChemistry: total - baseline,
        };
      }
    }
  }

  return best!;
}

type RawCandidate = Record<string, any>;
export type CandidateGroups = Record<BudgetGroup, RawCandidate[]>;
export interface GeneratedPlayer extends AutoBuildPlayer {
  isOwned: boolean;
  isLocked: boolean;
  slotPosition: string;
  price: number;
  metaScore: number;
  playerKey: string;
  card: RawCandidate;
}
export interface GeneratedSquad {
  squad: GeneratedPlayer[];
  manager: BestManagerResult | null;
  totalCost: number;
  totalChemistry: number;
  teamMetaScore: number;
  success: boolean;
  status: 'success' | 'incomplete' | 'fallback';
  iterations: number;
  searchLimitReached: boolean;
}

const relation = (value: any): RawCandidate => (Array.isArray(value) ? value[0] : value) ?? {};

function getRoleRequirement(position: string, options: AutoBuildOptions) {
  const role = options.slotRequirements?.[position]?.role;
  if (role) return { roleName: role.name, minLevel: role.minLevel };
  return options.slotRoleRequirements?.[position] ?? (options.roleRequirementsBySlot ? undefined : options.slotRoleRequirements?.[normalizeChemistryPosition(position)]);
}
export function isFemalePlayer(card: any): boolean {
  return [card, card.playerDef, relation(card.players), card.raw, card.raw?.playerDef, relation(card.raw?.players)].filter(Boolean)
    .some(source => ['Female', 'F', 0, '0'].includes(source.gender) || source.is_women === true || source.isWomen === true);
}
export function isMalePlayer(card: any): boolean {
  const sources = [card, card.playerDef, relation(card.players), card.raw, card.raw?.playerDef, relation(card.raw?.players)].filter(Boolean);
  return sources.some(source => ['Male', 'M', 1, '1'].includes(source.gender)
    || source.is_women === false || source.isWomen === false);
}
export function getMatchedRoleLevel(card: any, position: string, roleName: string): number {
  const rows = card.roles ?? card.card_roles ?? card.raw?.roles ?? card.raw?.card_roles ?? [];
  return (Array.isArray(rows) ? rows : []).reduce((highest: number, row: any) => {
    const role = row.roles ? relation(row.roles) : row;
    const rolePosition = role.position ?? row.position;
    if ((role.role_name ?? role.name) !== roleName
      || (rolePosition && normalizeChemistryPosition(rolePosition) !== normalizeChemistryPosition(position))) return highest;
    return Math.max(highest, Number(row.role_level ?? row.level ?? 0));
  }, 0);
}
function requiredRoles(req?: SlotRequirement): RoleReqItem[] {
  return req?.roles ?? (req?.role ? [req.role] : []);
}
function styleAlias(index: number): string { return index === 0 ? 'required_styles' : 'required_styles_' + index; }
function requiredPlaystyles(req?: SlotRequirement) {
  return req?.playstyles ? req.playstyles.map(ps => ({ ...ps, idOrName: ps.id })) : req?.playstyle ? [req.playstyle] : [];
}
function hasPlaystyle(card: any, target: string | number, goldOnly = false): boolean {
  const matches = (p: any) => String(p?.playstyle_id ?? p?.id ?? p) === String(target) || p?.name === String(target);
  return [card, card.raw].filter(Boolean).some(source => {
    const normal = Array.isArray(source.playstyles) ? source.playstyles : [];
    const plus = [source.playstyles_plus, source.playstylesPlus].flatMap(rows => Array.isArray(rows) ? rows : []);
    const joined = Array.isArray(source.card_playstyles) ? source.card_playstyles : [];
    return plus.some(matches)
      || normal.some((p: any) => matches(p) && (!goldOnly || p?.is_plus === true || p?.isPlus === true))
      || joined.some((row: any) => (!goldOnly || row.is_plus === true) && (matches(row) || matches(relation(row.playstyles))));
  });
}
export function matchesSlotRequirements(card: any, req?: SlotRequirement, slotPos = ''): boolean {
  if (!req) return true;
  const roles = requiredRoles(req);
  if (roles.length && !roles.some(role => getMatchedRoleLevel(card, slotPos, role.name) >= role.minLevel)) return false;
  return requiredPlaystyles(req).every(ps => hasPlaystyle(card, ps.idOrName, ps.isPlus));
}
export function evaluateCardScoreWithRequirements(card: any, targetPos: string, req?: SlotRequirement): number {
  if (!matchesSlotRequirements(card, req, targetPos)) return -9999;
  const baseScore = calculateMetaPaceScore(card, targetPos);
  let tacticalBonus = requiredRoles(req).reduce((best, role) => {
    const level = getMatchedRoleLevel(card, targetPos, role.name);
    return level >= role.minLevel ? Math.max(best, level >= 2 ? 5 : 2.5) : best;
  }, 0);
  for (const ps of requiredPlaystyles(req)) {
    if (hasPlaystyle(card, ps.idOrName, true)) tacticalBonus += 4;
    else if (!ps.isPlus && hasPlaystyle(card, ps.idOrName)) tacticalBonus += 2;
  }
  return baseScore + Math.min(tacticalBonus, 12);
}
function slotRequirement(position: string, options: AutoBuildOptions): SlotRequirement | undefined {
  const role = getRoleRequirement(position, options);
  return options.slotRequirements?.[position] ?? (role ? { role: { name: role.roleName, minLevel: role.minLevel } } : undefined);
}
function meetsRoleRequirement(card: any, position: string, options: AutoBuildOptions): boolean {
  return matchesSlotRequirements(card, slotRequirement(position, options), position);
}

/** Count real league memberships, not Icon placeholders or missing identifiers. */
export function withinLeagueLimit(players: readonly any[], limit = 6): boolean {
  const counts = new Map<string, number>();
  for (const player of players) {
    if (player.isIcon || player.isHero) continue;
    const id = player.leagueId ?? player.league_id ?? player.league?.id;
    if (id == null || id === '') continue;
    const key = String(id);
    const count = (counts.get(key) ?? 0) + 1;
    if (count > limit) return false;
    counts.set(key, count);
  }
  return true;
}
export const HYBRID_SKELETONS = [[4, 4, 3], [5, 4, 2], [5, 3, 3]] as const;
function leagueDistribution(players: readonly any[]): number[] {
  const counts = new Map<string, number>();
  for (const player of players) {
    if (player.isIcon || player.isHero) continue;
    const id = player.leagueId ?? player.league_id ?? player.league?.id;
    if (id == null || id === '') continue;
    counts.set(String(id), (counts.get(String(id)) ?? 0) + 1);
  }
  return [...counts.values()].sort((a, b) => b - a);
}
export function fitsHybridSkeleton(players: readonly any[], skeleton: readonly number[]): boolean {
  const counts = leagueDistribution(players);
  return counts.length <= skeleton.length && counts.every((count, index) => count <= skeleton[index]);
}
export function evaluateHybridStructure(players: readonly any[]): number {
  if (!withinLeagueLimit(players, 5)) return -500;
  const counts = leagueDistribution(players);
  let bonus = counts.length >= 2 && counts[1] >= 3 ? 150 : 0;
  if (counts.length >= 3 && counts[2] >= 2) bonus += 100;
  if (players.length === 11 && HYBRID_SKELETONS.some(pattern => fitsHybridSkeleton(players, pattern))) bonus += 100;
  const clubs = new Map<string, number>();
  for (const player of players) {
    if (player.isIcon || player.isHero) continue;
    const id = player.clubId ?? player.club_id ?? player.club?.id;
    if (id != null && id !== '') clubs.set(String(id), (clubs.get(String(id)) ?? 0) + 1);
  }
  for (const count of clubs.values()) bonus += count === 2 ? 40 : count === 3 || count === 4 ? 60 : 0;
  return bonus;
}
export function clubSynergyBonus(card: any, teammates: readonly any[]): number {
  const id = card.clubId ?? card.club_id;
  if (id == null || id === '' || card.isIcon || card.isHero) return 0;
  const count = teammates.filter(p => !p.isIcon && !p.isHero && String(p.clubId ?? p.club_id) === String(id)).length;
  return count >= 1 && count <= 3 ? 4 : 0;
}

/** Slot-specific solver score; supports API joins and normalized card inputs. */
export function calculateMetaPaceScore(card: any, targetPos: string, options: AutoBuildOptions = {}): number {
  if (!meetsRoleRequirement(card, targetPos, options)) return -9999;
  targetPos = normalizeChemistryPosition(targetPos);
  const stats = relation(card.player_stats ?? card.raw?.player_stats);
  const p = card.detail_stats ?? stats;
  const f = card.face_stats ?? { ...card, ...stats };
  const pace = f.pac ?? ((p.acceleration ?? 75) * .5 + (p.sprint_speed ?? 75) * .5);
  const agilityBalance = (p.agility ?? f.dri ?? 75) * .5 + (p.balance ?? f.dri ?? 75) * .5;
  const finishingComposure = (p.finishing ?? f.sho ?? 70) * .6 + (p.composure ?? 75) * .4;
  const def = (p.def_awareness ?? f.def ?? 60) * .5 + (p.standing_tackle ?? f.def ?? 60) * .5;
  const phy = (p.strength ?? f.phy ?? 65) * .6 + (p.stamina ?? f.phy ?? 65) * .4;
  const hexagonAvg = ((f.pac ?? 70) + (f.sho ?? 70) + (f.pas ?? 70) + (f.dri ?? 70) + (f.def ?? 60) + (f.phy ?? 65)) / 6;
  let baseScore;
  if (['ST', 'CF', 'LW', 'RW', 'LM', 'RM', 'CAM'].includes(targetPos)) {
    baseScore = pace * .50 + finishingComposure * .20 + agilityBalance * .20 + phy * .10;
    if (pace < (targetPos === 'CAM' ? 80 : 82)) baseScore -= 25;
  } else if (['CM', 'CDM'].includes(targetPos)) {
    const pass = (p.vision ?? f.pas ?? 70) * .5 + (p.short_passing ?? f.pas ?? 70) * .5;
    baseScore = pace * .45 + hexagonAvg * .30 + pass * .15 + phy * .10;
    if ((p.def_awareness ?? f.def ?? 50) < 60) baseScore -= 30;
    const sources = [card, card.raw].filter(Boolean);
    const primaryPositions = sources.flatMap(source => [
      source.primary_position_str ?? source.primary_position ?? source.position_name ?? source.position,
      ...[source.positions, source.card_positions].flatMap(rows => Array.isArray(rows)
        ? rows.filter(row => row?.is_primary).map(row => relation(row.positions).name ?? relation(row.position).name ?? row.position_name ?? row.name) : []),
    ]);
    if (primaryPositions.some(pos => typeof pos === 'string' && ['ST', 'CF', 'LW', 'RW'].includes(normalizeChemistryPosition(pos)))) baseScore -= 10;
    if (pace < 70) baseScore -= 25;
  } else if (['LB', 'RB', 'LWB', 'RWB'].includes(targetPos)) {
    const pass = (p.vision ?? f.pas ?? 70) * .5 + (p.short_passing ?? f.pas ?? 70) * .5;
    baseScore = pace * .50 + def * .20 + phy * .15 + pass * .15;
    if (pace < 82) baseScore -= 25;
  } else if (targetPos === 'CB') {
    baseScore = pace * .50 + def * .30 + phy * .20;
    // DB cards keep gender on the joined player; normalized cards may expose it directly.
    const player = relation(card.players ?? card.raw?.players);
    const isFemale = isFemalePlayer(card);
    if (isFemale) baseScore -= 25;
    const height = [card.height, card.playerDef?.height, card.raw?.height, card.raw?.playerDef?.height, player.height]
      .map(Number).find(value => Number.isFinite(value) && value > 0) ?? (isFemale ? 170 : 185);
    const jumping = p.jumping ?? f.phy ?? 75;
    const isSpecialJumper = jumping >= 90 || card.is_hero || card.is_icon
      || card.raw?.is_hero || card.raw?.is_icon || isSpecialCard(card) || isSpecialCard(card.raw ?? {});
    if (height <= 179) baseScore -= isSpecialJumper ? 5 : 20;
  } else {
    baseScore = card.overall ?? 80;
    if (targetPos === 'GK') baseScore -= isFemalePlayer(card) ? 25 : 0;
  }
  // Match the actual primary position, never an unmarked alternate position.
  // Support normalized cards and both object/array Supabase relation shapes.
  const matchesPrimary = (value: unknown) => {
    if (typeof value !== 'string') return false;
    const primary = normalizeChemistryPosition(value);
    return primary === targetPos || [['LM', 'LW'], ['RM', 'RW'], ['LB', 'LWB'], ['RB', 'RWB']]
      .some(pair => pair.includes(targetPos) && pair.includes(primary));
  };
  const hasPrimary = (source: any) => {
    if (!source) return false;
    if (matchesPrimary(source.primary_position_str ?? source.primary_position ?? source.position_name ?? source.position)) return true;
    return [source.positions, source.card_positions].some(rows => Array.isArray(rows)
      && rows.some(row => row?.is_primary && matchesPrimary(
        relation(row.positions).name ?? relation(row.position).name ?? row.position_name ?? row.name)));
  };
  const primaryBonus = hasPrimary(card) || hasPrimary(card.raw) ? 5 : 0;
  const bodyType = String(card.body_type ?? card.raw?.body_type ?? '').toLowerCase();
  const bodyBonus = targetPos !== 'GK' && bodyType.includes('lean') && bodyType.includes('tall') ? 2 : 0;
  return baseScore + primaryBonus + bodyBonus;
}

/** Accepts either the grouped input or the flat, annotated output of fetchCandidatePlayers. */
export function groupCandidatePlayers(candidates: CandidatePlayer[]): CandidateGroups {
  return Object.fromEntries(['FW', 'MF', 'DF'].map(group => [group,
    candidates.filter(card => card.candidateGroups.includes(group as BudgetGroup)),
  ])) as CandidateGroups;
}

function prepareCandidate(card: RawCandidate, slotPosition: string, threeBack: boolean, isOwned = false, isLocked = false): GeneratedPlayer | null {
  if (card.id == null || (!isOwned && (card.price == null || String(card.price).trim() === ''))) return null;
  const marketPrice = Number(card.price);
  if (!isOwned && (!Number.isFinite(marketPrice) || marketPrice < 0)) return null;
  const price = calculateSquadTotalCost({ candidate: { card, isOwned } });
  const rows = card.card_positions ?? [];
  const primary = rows.find((row: RawCandidate) => row.is_primary) ?? rows[0];
  const player = relation(card.players);
  const position = relation(primary?.positions).name ?? card.position ?? card.primary_position;
  const altPositions = rows.length ? rows.map((row: RawCandidate) => relation(row.positions).name).filter(Boolean)
    : card.altPositions ?? card.alt_positions ?? card.secondary_positions ?? [];
  // Canonical chemistry cards must not pass through the adapter a second time.
  const canonical = ['nationId', 'leagueId', 'clubId'].every(key => key in card);
  const chemistryCard = canonical ? { ...card, id: String(card.id), position, altPositions } as PlayerCard
    : adaptChemistryPlayerCard({ ...card, name: card.name ?? player.name, position, altPositions });
  if (!isLocked && !isPositionMatched(slotPosition, chemistryCard)) return null;
  const normalized = normalizeChemistryPosition(slotPosition);
  const metaScore = calculateMetaPaceScore(card, normalized);
  return { ...chemistryCard, slotPosition, price, metaScore, card, isOwned, isLocked,
    playerKey: String(card.player_id ?? player.id ?? card.id) };
}

/** Reuses the exact UI chemistry rules and simulates the manager only when enabled. */
export function calculateSquadChemistry(players: readonly AutoBuildPlayer[], considerManager: boolean) {
  const best = considerManager ? findBestManager(players) : null;
  const manager = best && (best.bestLeagueId != null || best.bestNationId != null) ? best : null;
  const result = calculateChemistry(players.map(player => ({ position: player.slotPosition ?? player.position, player })),
    manager ? { leagueId: manager.bestLeagueId ?? undefined, nationId: manager.bestNationId ?? undefined } : null);
  return { ...result, manager };
}

/**
 * Bounded heuristic, not a proof of global optimality. Await the result.
 * Uses focus-specific position order, caps and scores, actual price reserves,
 * chemistry repair and at most two upgrades.
 * State/inputs are never mutated; unsuccessful results explicitly describe failure.
 * Search is bounded and yields every 20 operations.
 */
export async function generateOptimalSquad(
  formation: string, candidates: CandidateGroups | CandidatePlayer[], totalBudget: number | null | undefined,
  minChemistry: number, considerManager: boolean,
  options: AutoBuildOptions = {},
): Promise<GeneratedSquad> {
  const layout = FORMATIONS.find(item => item.name === formation);
  if (!layout) throw new Error(`Unsupported formation: ${formation}`);
  totalBudget = totalBudget ?? 0;
  if (!Number.isFinite(totalBudget) || totalBudget < 0) throw new RangeError('Budget must be 0 or more.');
  const spendingLimit = totalBudget === 0 ? Infinity : totalBudget;
  if (!Number.isInteger(minChemistry) || minChemistry < 0 || minChemistry > 33) throw new RangeError('Chemistry must be between 0 and 33.');
  const groups = Array.isArray(candidates) ? groupCandidatePlayers(candidates) : candidates;
  const excluded = exclusionSet(options, formation);
  const squadOvrRange = validateSquadOvrRange(options.squadOvrRange);
  const threeBack = formation.startsWith('3');
  const maxSpecial = specialLimit(options);
  const existing = options.currentSquad ?? {};
  // Locked purchases are reserved before filling any unlocked slot.
  const { remainingTotalBudget } = getRemainingAutoBuildBudget(totalBudget, formation, options);
  const focus = options.focus ?? 'attack';
  getFocusWeight('ST', focus); // Validate even when every slot is locked.
  let leagueCap = 5;
  let skeleton: readonly number[] | null = null;
  let requireQualityFloor = true;
  const lowGold = (player: GeneratedPlayer) => !player.isLocked && !player.isIcon && !player.isHero
    && totalBudget >= 1000000 && Number(player.card.overall) <= 83
    && /gold/i.test(String(player.card.version ?? player.card.card_type ?? ''));
  const withinBudget = (players: GeneratedPlayer[]) => withinLeagueLimit(players, leagueCap)
    && (!skeleton || fitsHybridSkeleton(players, skeleton))
    && players.filter(lowGold).length <= (requireQualityFloor ? 0 : 2)
    && players.reduce((sum, player) => sum + player.price, 0) <= spendingLimit;
  const ownedIds = new Set(Object.values(existing).filter(entry => entry?.isOwned).map(entry => String(rawEntryCard(entry!).id)));
  const fixedPlayers = new Map<number, GeneratedPlayer>();
  layout.slots.forEach(({ position }, index) => {
    const entry = existing[position];
    if (!entry?.isLocked) return;
    const fixed = prepareCandidate(rawEntryCard(entry), position, threeBack, entry.isOwned === true, true);
    if (!fixed) throw new Error('Check the price and card details of your locked players.');
    if (!meetsRoleRequirement(rawEntryCard(entry), position, options)) throw new Error('A locked player does not meet the selected tactical requirements. Unlock it or change the tactical requirements.');
    fixed.metaScore = evaluateCardScoreWithRequirements(rawEntryCard(entry), position, slotRequirement(position, options)) * getFocusWeight(position, focus);
    fixedPlayers.set(index, fixed);
  });
  const specialCount = (players: GeneratedPlayer[]) => players.filter(p => p.isIcon || p.isHero).length;
  if (specialCount([...fixedPlayers.values()]) > maxSpecial) throw new Error('Locked Icons / Heroes exceed the limit. Unlock players or increase the limit.');
  if (new Set([...fixedPlayers.values()].map(p => p.playerKey)).size !== fixedPlayers.size) throw new Error('The same player is locked in multiple positions.');
  if (!withinLeagueLimit([...fixedPlayers.values()])) throw new Error('Locked players exceed the six-player league limit. Unlock players to build a hybrid squad.');
  const pools: GeneratedPlayer[][] = layout.slots.map(({ position }) => {
    const unique = new Map<string, GeneratedPlayer>();
    const owned = Object.values(existing).filter(entry => entry?.isOwned).map(entry => rawEntryCard(entry!));
    for (const card of [...(groups[getPositionBudgetGroup(position, threeBack)] ?? []), ...owned]) {
      // Locked slots are restored separately via fixedPlayers, never filtered here.
      if (!passesMarketPriceFilter(card, options)) continue;
      if (excluded.has(getCardVersionId(card)) || card.overall == null || card.overall < squadOvrRange.min || card.overall > squadOvrRange.max) continue;
      if (!meetsRoleRequirement(card, position, options)) continue;
      const prepared = prepareCandidate(card, position, threeBack, ownedIds.has(String(card.id)) || card.isOwned === true);
      if (prepared && prepared.price > getMaxSlotPrice(position, focus, totalBudget, remainingTotalBudget)) continue;
      if (prepared && (prepared.isIcon || prepared.isHero) && maxSpecial === 0) continue;
      if (prepared) {
        prepared.metaScore = evaluateCardScoreWithRequirements(card, position, slotRequirement(position, options)) * getFocusWeight(position, focus);
        unique.set(prepared.id, prepared);
      }
    }
    return [...unique.values()].sort((a, b) => b.metaScore - a.metaScore || a.price - b.price || a.id.localeCompare(b.id));
  });
  const openPositions = layout.slots.filter((_, i) => !fixedPlayers.has(i)).map(slot => slot.position);
  const order = getSlotEvaluationOrder(focus, openPositions).map(position => layout.slots.findIndex(slot => slot.position === position));
  let iterations = 0;
  const maxIterations = Math.min(12000, Math.max(1500, pools.reduce((sum, pool) => sum + pool.length, 0) * 4 + 1100));
  async function tick() {
    iterations++;
    if (iterations % 20 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  const selected: Array<GeneratedPlayer | undefined> = Array(11);
  fixedPlayers.forEach((player, index) => selected[index] = player);
  let partial: GeneratedPlayer[] = [];
  const usedCards = new Set([...fixedPlayers.values()].map(p => p.id));
  const usedPlayers = new Set([...fixedPlayers.values()].map(p => p.playerKey));
  const fixedCost = [...fixedPlayers.values()].reduce((sum, p) => sum + p.price, 0);
  if (fixedCost > spendingLimit) throw new Error('Locked players exceed the target budget. Unlock players or increase the budget.');
  // A search preference only: keep the underlying meta score stable as the balance changes.
  const isAttackSlot = (position: string) => ['ST', 'CF', 'CAM', 'LW', 'RW', 'LM', 'RM'].includes(normalizeChemistryPosition(position));
  const attackSpend = (players: GeneratedPlayer[]) => players.filter(p => isAttackSlot(p.slotPosition)).reduce((sum, p) => sum + p.price, 0);
  const selectionScore = (card: GeneratedPlayer, remaining: number, teammates: GeneratedPlayer[]) => card.metaScore * (
    focus === 'attack' && normalizeChemistryPosition(card.slotPosition) === 'CB'
      && remaining >= 80000 && card.price >= 35000 && card.price <= 90000 ? 1.15 : 1) + clubSynergyBonus(card, teammates)
    + (evaluateHybridStructure([...teammates, card]) - evaluateHybridStructure(teammates)) * .15
    - (lowGold(card) ? 30 : 0)
    + (focus === 'attack' && totalBudget > 0 && isAttackSlot(card.slotPosition)
      ? 8 * Math.min(card.price, Math.max(0, totalBudget * .5 - attackSpend(teammates))) / (totalBudget * .5) : 0);
  const rankCandidates = (pool: GeneratedPlayer[], remaining: number, teammates: GeneratedPlayer[]) => pool.slice().sort((a, b) =>
    selectionScore(b, remaining, teammates) - selectionScore(a, remaining, teammates) || a.price - b.price || a.id.localeCompare(b.id));
  async function build(depth: number, cost: number, requireChemistry: boolean, stopAt: number): Promise<boolean> {
    const filled = selected.filter((p): p is GeneratedPlayer => Boolean(p));
    if (filled.length > partial.length) partial = [...filled];
    if (depth === order.length) return withinBudget(filled) && (!requireChemistry
      || calculateSquadChemistry(filled, considerManager).totalChemistry >= minChemistry);
    const index = order[depth];
    const orderedPool = requireChemistry ? rankCandidates(pools[index], spendingLimit - cost, filled) : pools[index];
    for (const card of orderedPool) {
      if (iterations >= stopAt) return false;
      await tick();
      const paidSlotsLeft = order.slice(depth + 1).filter(next => !pools[next].some(p => p.price === 0)).length;
      if (card.price > getMaxSlotPrice(layout.slots[index].position, focus, totalBudget, spendingLimit - cost, paidSlotsLeft)) continue;
      if (usedPlayers.has(card.playerKey) || usedCards.has(card.id)) continue;
      if (specialCount([...filled, card]) > maxSpecial || !withinBudget([...filled, card])) continue;
      {

        // Optimistic reserve: each remaining slot needs at least its cheapest unused card.
        let reserve = 0;
        for (const next of order.slice(depth + 1)) {
          const eligible = pools[next].filter(p => p.playerKey !== card.playerKey && p.id !== card.id
            && !usedPlayers.has(p.playerKey) && !usedCards.has(p.id));
          const minimum = eligible.length ? Math.min(...eligible.map(p => p.price)) : Infinity;
          // Prefer reserving a useful winger before earlier slots spend its coins.
          // The cheap fallback relaxes this preference if chemistry/locks make it infeasible.
          const reserveWinger = requireChemistry && focus === 'attack' && Number.isFinite(spendingLimit)
            && ['LW', 'RW'].includes(normalizeChemistryPosition(layout.slots[next].position));
          const bestWinger = reserveWinger ? eligible.reduce<GeneratedPlayer | undefined>((best, p) =>
            !best || p.metaScore > best.metaScore || (p.metaScore === best.metaScore && p.price < best.price) ? p : best, undefined) : undefined;
          reserve += bestWinger?.price ?? minimum;
        }
        if (cost - fixedCost + card.price + reserve > remainingTotalBudget) continue;

      }
      selected[index] = card;
      usedPlayers.add(card.playerKey); usedCards.add(card.id);
      if (await build(depth + 1, cost + card.price, requireChemistry, stopAt)) return true;
      selected[index] = undefined;
      usedPlayers.delete(card.playerKey); usedCards.delete(card.id);
    }
    return false;
  }
  // Stage 1: exact three-league skeletons; special cards act as flexible links.
  // Stage 2: any five-per-league hybrid with the same quality floor.
  // Stage 3: bounded recovery, at most six regulars per league and two low Golds.
  let complete = false;
  let bestTemplate: { squad: GeneratedPlayer[]; pattern: readonly number[]; score: number } | null = null;
  for (const pattern of HYBRID_SKELETONS) {
    skeleton = pattern;
    if (!withinBudget([...fixedPlayers.values()])) continue;
    complete = await build(0, fixedCost, true, iterations + 300);
    if (complete) {
      const squad = selected.slice() as GeneratedPlayer[];
      const score = squad.reduce((sum, player) => sum + player.metaScore, 0) + evaluateHybridStructure(squad) * .1;
      if (!bestTemplate || score > bestTemplate.score) bestTemplate = { squad, pattern, score };
      for (const index of order) selected[index] = undefined;
      usedCards.clear(); usedPlayers.clear();
      fixedPlayers.forEach(player => { usedCards.add(player.id); usedPlayers.add(player.playerKey); });
    }
  }
  complete = Boolean(bestTemplate);
  if (bestTemplate) {
    skeleton = bestTemplate.pattern;
    bestTemplate.squad.forEach((player, index) => selected[index] = player);
  }
  if (!complete) {
    skeleton = null;
    complete = await build(0, fixedCost, true, iterations + 350);
  }
  if (!complete) {
    leagueCap = 6;
    requireQualityFloor = false;
    complete = await build(0, fixedCost, true, iterations + 350);
  }
  if (!complete) {
    pools.forEach(pool => pool.sort((a, b) => a.price - b.price || b.metaScore - a.metaScore));
    complete = await build(0, fixedCost, false, iterations + 450);
  }

  function evaluate(squad: GeneratedPlayer[]) {
    const chemistry = calculateSquadChemistry(squad, considerManager);
    return { squad, totalCost: squad.reduce((sum, p) => sum + p.price, 0),
      teamMetaScore: squad.length ? squad.reduce((sum, p) => sum + p.metaScore, 0) / squad.length : 0,
      totalChemistry: chemistry.totalChemistry, manager: chemistry.manager, playerChemMap: chemistry.playerChemMap };
  }
  let current = evaluate(complete ? selected as GeneratedPlayer[] : partial);
  const fallbackLimit = spendingLimit;
  const affinity = (squad: GeneratedPlayer[]) => squad.reduce((sum, player, i) => sum + squad.slice(i + 1)
    .reduce((count, other) => count + ['leagueId', 'nationId', 'clubId'].filter(key => {
      const id = player[key as keyof PlayerCard];
      return id !== '' && id != null && String(id) === String(other[key as keyof PlayerCard]);
    }).length, 0), 0);
  function quality(value: typeof current) {
    return [Math.max(0, value.totalCost - fallbackLimit),
      Math.max(0, minChemistry - value.totalChemistry)];
  }
  function better(a: typeof current, b: typeof current) {
    if (!withinBudget(a.squad)) return false;
    const aq = quality(a), bq = quality(b);
    if (aq[0] !== bq[0]) return aq[0] < bq[0];
    if (aq[1] !== bq[1]) return aq[1] < bq[1];
    // Shared affiliations help cross thresholds even when a single swap adds no chemistry.
    if (aq[1] > 0) {
      const delta = affinity(a.squad) - affinity(b.squad);
      if (delta) return delta > 0;
    }
    const aScore = a.teamMetaScore + evaluateHybridStructure(a.squad) * .02 - a.squad.filter(lowGold).length * 3;
    const bScore = b.teamMetaScore + evaluateHybridStructure(b.squad) * .02 - b.squad.filter(lowGold).length * 3;
    return aScore > bScore || (aScore === bScore && a.totalCost < b.totalCost);
  }
  // Seed affiliation clusters to cross multi-player chemistry thresholds within budget.
  const clusterPools = pools;
  const affiliationKeys = ['clubId', 'nationId', 'leagueId'] as const;
  const seeds = new Map<string, { key: typeof affiliationKeys[number]; id: string; slots: Set<number> }>();
  clusterPools.forEach((pool, index) => pool.forEach(player => affiliationKeys.forEach(key => {
    const id = player[key];
    if (id == null || id === '') return;
    const token = `${key}:${id}`;
    if (!seeds.has(token)) seeds.set(token, { key, id: String(id), slots: new Set() });
    seeds.get(token)!.slots.add(index);
  })));
  if (complete && current.totalChemistry < minChemistry) {
    for (const seed of [...seeds.values()].sort((a, b) => b.slots.size - a.slots.size).slice(0, 8)) {
      const trialSlots: Array<GeneratedPlayer | undefined> = Array(11);
      fixedPlayers.forEach((player, index) => trialSlots[index] = player);
      for (const index of order) {
        if (iterations >= maxIterations) break;
        await tick();
        const occupied = trialSlots.filter((p): p is GeneratedPlayer => Boolean(p));
        const eligible = clusterPools[index].filter(p => !occupied.some(other => other.id === p.id || other.playerKey === p.playerKey)
          && specialCount([...occupied, p]) <= maxSpecial && withinBudget([...occupied, p]));
        const links = (p: GeneratedPlayer) => clubSynergyBonus(p, occupied) + affinity([...occupied, p]) - affinity(occupied)
          + (String(p[seed.key]) === seed.id ? 4 : 0);
        eligible.sort((a, b) => links(b) - links(a) || (b.metaScore - a.metaScore)
          || a.id.localeCompare(b.id));
        if (!eligible.length) break;
        trialSlots[index] = eligible[0];
      }
      if (trialSlots.filter(Boolean).length !== 11) continue;
      const trial = evaluate(trialSlots as GeneratedPlayer[]);
      if (better(trial, current)) current = trial;
    }
  }
  while (complete && current.totalChemistry < minChemistry && iterations < maxIterations) {
    let next = current;
    const priority = current.squad.map((_, i) => i).sort((a, b) => current.totalCost > fallbackLimit
      ? current.squad[b].price / Math.max(1, current.squad[b].metaScore) - current.squad[a].price / Math.max(1, current.squad[a].metaScore)
      : current.playerChemMap[current.squad[a].id] - current.playerChemMap[current.squad[b].id]);
    search: for (const i of priority) {
      if (fixedPlayers.has(i)) continue;
      const occupied = current.squad.filter((_, index) => index !== i);
      const pool = pools[i].slice().sort((a, b) => current.totalCost > spendingLimit ? a.price - b.price : b.metaScore - a.metaScore);
      for (const candidate of pool) {
        if (iterations >= maxIterations) break search;
        await tick();
        if (candidate.id === current.squad[i].id || occupied.some(p => p.id === candidate.id || p.playerKey === candidate.playerKey)) continue;
        const squad = current.squad.slice(); squad[i] = candidate;
        if (specialCount(squad) > maxSpecial || !withinBudget(squad)) continue;
        const trial = evaluate(squad);
        if (better(trial, next)) next = trial;
      }
    }
    // A paired upgrade can preserve chemistry or free a shared player identity
    // even when neither single substitution improves the squad on its own.
    if (next === current) {
      pairSearch: for (let a = 0; a < order.length; a++) {
        for (let b = a + 1; b < order.length; b++) {
          const i = order[a], j = order[b];
          const occupied = current.squad.filter((_, index) => index !== i && index !== j);
          const eligible = (index: number) => pools[index].filter(p => !occupied.some(other => other.id === p.id || other.playerKey === p.playerKey))
            .sort((x, y) => y.metaScore - x.metaScore || x.price - y.price).slice(0, 12);
          for (const left of eligible(i)) for (const right of eligible(j)) {
            if (iterations >= maxIterations) break pairSearch;
            if (left.id === right.id || left.playerKey === right.playerKey) continue;
            if (current.totalCost <= spendingLimit && current.totalChemistry >= minChemistry
              && left.metaScore + right.metaScore <= current.squad[i].metaScore + current.squad[j].metaScore) continue;
            await tick();
            const squad = current.squad.slice(); squad[i] = left; squad[j] = right;
            if (specialCount(squad) > maxSpecial || !withinBudget(squad)) continue;
            const trial = evaluate(squad);
            if (better(trial, next)) next = trial;
          }
        }
      }
    }
    if (next === current) break;
    current = next;
  }
  // Reserve a fresh pass even when chemistry repair exhausted the main search.
  const upgradeLimit = iterations + Math.min(50000, Math.max(1500, pools.reduce((sum, pool) => sum + pool.length, 0) * 12));
  if (complete && Number.isFinite(spendingLimit) && current.totalChemistry >= minChemistry
    && spendingLimit - current.totalCost >= 50000) {
    for (let upgrades = 0; upgrades < 2 && current.totalCost < spendingLimit * .98 && iterations < upgradeLimit; upgrades++) {
      let improved = false;
      // Review centre-back improvements before midfield spending, including CB aliases.
      const upgradePriority = (index: number) => focus === 'attack' && attackSpend(current.squad) < totalBudget * .5 && isAttackSlot(layout.slots[index].position) ? -1
        : normalizeChemistryPosition(layout.slots[index].position) === 'CB' ? 0 : 1;
      const weakest = order.slice().sort((a, b) => upgradePriority(a) - upgradePriority(b)
        || current.squad[a].metaScore - current.squad[b].metaScore
        || current.squad[a].price - current.squad[b].price);
      for (const i of weakest) {
        const previous = current.squad[i];
        const available = spendingLimit - current.totalCost + previous.price;
        const occupied = current.squad.filter((_, index) => index !== i);
        for (const candidate of rankCandidates(pools[i], available, occupied)) {
          if (iterations >= upgradeLimit) break;
          if (candidate.metaScore <= previous.metaScore || candidate.price > available
            || occupied.some(p => p.id === candidate.id || p.playerKey === candidate.playerKey)) continue;
          await tick();
          const squad = current.squad.slice(); squad[i] = candidate;
          if (specialCount(squad) > maxSpecial || !withinBudget(squad)) continue;
          const trial = evaluate(squad);
          if (trial.totalChemistry < minChemistry) continue;
          if (!better(trial, current)) continue;
          current = trial; improved = true; break;
        }
        if (improved) break;
      }
      if (!improved) break;
    }
  }
  const success = complete && withinBudget(current.squad) && current.totalCost <= spendingLimit && current.totalChemistry >= minChemistry;
  const { playerChemMap: _map, ...result } = current;
  return { ...result, success, status: success ? 'success' : complete ? 'fallback' : 'incomplete',
    iterations, searchLimitReached: iterations >= maxIterations };
}
