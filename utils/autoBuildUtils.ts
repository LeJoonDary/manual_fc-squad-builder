import { calculatePlaystyleAndSkillBonus } from './playstyleBonus';
export { getPlaystyleTier, getPsScore, calculatePlaystyleAndSkillBonus } from './playstyleBonus';
import { priorityGroup, effectivePriorityGroups, DEFAULT_PRIORITY_GROUPS } from './priorityGroups.js';
import { isCardIcon, isCardHero } from './specialCardIdentity.js';
export { isCardIcon, isCardHero } from './specialCardIdentity.js';
// Prepared candidates have already passed the robust raw-card classifier.
const engineIcon = (card: any): boolean => card?.card && card?.slotPosition && typeof card.isIcon === 'boolean' ? card.isIcon : isCardIcon(card);
import { calculateChemistry } from './chemistry.ts';
import { sharedClubKey } from './clubIdentity';
import type { PlayerCard, SquadSlot } from '../types/chemistry';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adaptChemistryPlayerCard, isPositionMatched, normalizeChemistryPosition } from './chemistry.ts';
import { FORMATIONS } from './formations.js';
import { getCardCoinPrice, calculateSquadTotalCost } from './squadCost.ts';
import { getCardVersionId, normalizeExcludedCardVersionIds, validateSquadOvrRange } from './excludedCardVersions.js';

export interface PlaystyleReqItem { id: number; name: string; isPlus: boolean; }
export interface RoleReqItem { name: string; minLevel: 1 | 2; }
export interface SlotRequirement {
  minSm?: number;
  minWf?: number;
  minSkillMoves?: number;
  minWeakFoot?: number;
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
  keyPositions?: string[];
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
  return card.price != null && Number.isFinite(Number(card.price)) && Number(card.price) > 0;
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
  return engineIcon(card) || isCardHero(card);
}

export type BudgetGroup = 'FW' | 'MF' | 'DF';
export type SquadFocus = 'attack' | 'balanced' | 'defense';
const CANDIDATE_LIMITS = { FW: 300, MF: 300, DF: 300 };
export const STAGE_TIMEOUT_MS = 5000;
export const MAX_BACKTRACK_ITERATIONS = 50000;
// Explicit solver and pitch display fields; omit full card-detail joins.
export const AUTO_BUILD_CANDIDATE_SELECT = `
  id,player_id,overall,price,version,card_type,club_id,league_id,background_url,sm,wf,preferred_foot,body_type,
  players!inner(id,name,long_name,nation_id,gender,height,nations(name,flag_url)),
  clubs(id,name),leagues(id,name),card_positions(is_primary,positions(name)),
  card_roles(role_level,roles(position,role_name)),
  card_playstyles(playstyle_id,is_plus,playstyles(id,name)),
  player_stats(gk_diving,gk_handling,gk_kicking,gk_reflexes,gk_positioning,sprint_speed,pac,sho,pas,dri,def,phy,acceleration,agility,balance,
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

/** Reserve locked purchases before spending the shared balance on open slots.
 * Render callers may disable the over-budget exception to display a warning; execution stays strict.
 */
export function getRemainingAutoBuildBudget(totalBudget: number | null | undefined, formation: string, options: AutoBuildOptions = {}, validateLockedCost = true) {
  totalBudget = totalBudget ?? 0;
  if (!Number.isFinite(totalBudget) || totalBudget < 0) throw new RangeError('Total budget must be a finite number of 0 or more.');
  const layout = FORMATIONS.find(item => item.name === formation);
  if (!layout) throw new Error(`Unsupported formation: ${formation}`);
  const lockedCost = layout.slots.reduce((sum, slot) => {
    const entry = options.currentSquad?.[slot.position];
    return Math.min(Number.MAX_VALUE, sum + (entry?.isLocked && !entry.isOwned ? getCardCoinPrice(rawEntryCard(entry)) : 0));
  }, 0);
  const unlimited = totalBudget === 0;
  if (validateLockedCost && !unlimited && lockedCost > totalBudget) throw new Error(
    `Locked players cost (${lockedCost.toLocaleString('en-US')} C) exceeds target budget (${totalBudget.toLocaleString('en-US')} C). Please increase budget or unlock cards.`);
  // Unlimited has no finite remaining amount to display; the solver uses Infinity.
  return { lockedCost, unlimited, remainingTotalBudget: unlimited ? Infinity : totalBudget - lockedCost,
    distributableBudget: unlimited ? 0 : Math.max(0, totalBudget - lockedCost) };
}

/** Compatibility exports: legacy focus values no longer alter engine behavior. */
export function getFocusWeight(_position: string, _focus?: SquadFocus): number { return 1; }
export function getSlotEvaluationOrder(_focus: SquadFocus, positions: readonly string[]): string[] {
  return getAnchorSlotOrder(positions);
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
  return Math.max(0, Math.floor(remainingBudget - Math.max(0, remainingSlotsCount) * 1000));
}

export type CandidatePlayer = Record<string, unknown> & {
  id: string | number;
  candidateGroups: BudgetGroup[];
};

/**
 * Returns raw UI-compatible card_versions rows, retaining full card_positions and relations.
 * candidateGroups identifies eligible positions, without partitioning purchase funds.
 * Fetch enough candidates for both the 150, 200 and 300-card search passes.
 * All positions share the total balance left after locked purchases.
 * Price 0 is allowed only when its exclusion toggle is off; null/negative prices are excluded.
 */
export async function fetchCandidatePlayers(
  totalBudget: number | null | undefined, formation: string,
  isThreeBack: boolean, supabase: SupabaseClient,
  options: AutoBuildOptions = {},
): Promise<CandidatePlayer[]> {
  const { remainingTotalBudget, unlimited } = getRemainingAutoBuildBudget(totalBudget, formation, options);

  if (isThreeBack !== formation.startsWith('3')) throw new Error('Formation does not match the isThreeBack setting.');
  const openSlots = FORMATIONS.find(layout => layout.name === formation)!.slots.filter(slot => !options.currentSquad?.[slot.position]?.isLocked);
  const formationPositions = FORMATIONS.find(layout => layout.name === formation)!.slots.map(slot => slot.position);
  const selectionOrder = buildDynamicFillOrder(FORMATIONS.find(layout => layout.name === formation)!.slots, options.keyPositions)
    .filter(slot => openSlots.some(open => open.position === slot.position)).map(slot => slot.position);
  const plan = (['FW', 'MF', 'DF'] as BudgetGroup[]).map(group => ({ group, limit: CANDIDATE_LIMITS[group],
    positions: [...new Set(openSlots.filter(slot => getPositionBudgetGroup(slot.position, isThreeBack) === group)
      .map(slot => normalizeChemistryPosition(slot.position)))] }));
  const excluded = exclusionSet(options, formation);
  const squadOvrRange = validateSquadOvrRange(options.squadOvrRange);
  const maxSpecial = specialLimit(options);
  const entries = Object.entries(options.currentSquad ?? {}).filter(([, entry]) => entry?.card);
  const locked = entries.filter(([, entry]) => entry!.isLocked);
  const lockedSpecial = locked.filter(([, entry]) => isSpecialCard(rawEntryCard(entry!)) && !isCardIcon(rawEntryCard(entry!))).length;
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
        .gte('overall', Math.max(80, squadOvrRange.min, (unlimited || (totalBudget ?? 0) >= 5000000) ? 85 : 0)).lte('overall', squadOvrRange.max).gte('price', 0);
      const stars = slotRequirement(roleSlot, options);
      if (stars?.minSm ?? stars?.minSkillMoves) query = query.gte('sm', (stars.minSm ?? stars.minSkillMoves)!);
      if (stars?.minWf ?? stars?.minWeakFoot) query = query.gte('wf', (stars.minWf ?? stars.minWeakFoot)!);
      if (req) query = query.eq('required_roles.roles.position', positions[0])
        .eq('required_roles.roles.role_name', req.roleName).gte('required_roles.role_level', req.minLevel);
      for (const [index, ps] of styles.entries()) {
        const field = typeof ps.idOrName === 'number' || /^\d+$/.test(String(ps.idOrName)) ? 'id' : 'name';
        query = query.eq(styleAlias(index) + '.playstyles.' + field, ps.idOrName);
        if (ps.isPlus) query = query.eq(styleAlias(index) + '.is_plus', true);
      }
      if (options.excludeZeroPriceCards === true) query = query.gt('price', 0);
      if (excluded.size) query = query.not('id', 'in', `(${[...excluded].join(',')})`);
      if (cap !== null) query = query.lte('price', Math.floor(cap));
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
        // Later caps may grow after cheap selections; fetch up to the true remaining balance.
        unlimited ? null : remainingTotalBudget,
        300, false, [position], slot, role ? { roleName: role.name, minLevel: role.minLevel } : undefined)));
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
      // No later manager can improve on full chemistry; preserve first-tie behavior.
      if (total === 33) return best!;
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
  finalScore: number;
  squad: GeneratedPlayer[];
  manager: BestManagerResult | null;
  totalCost: number;
  totalChemistry: number;
  teamMetaScore: number;
  success: boolean;
  status: 'success' | 'incomplete' | 'chemistry_unmet';
  minChemistryTarget: number;
  iterations: number;
  searchLimitReached: boolean;
  searchStage: 1 | 2 | 3 | 4;
  stageAttempts: number[];
}

const relation = (value: any): RawCandidate => (Array.isArray(value) ? value[0] : value) ?? {};

function getRoleRequirement(position: string, options: AutoBuildOptions) {
  const role = options.slotRequirements?.[position]?.role;
  if (role) return { roleName: role.name, minLevel: role.minLevel };
  return options.slotRoleRequirements?.[position] ?? (options.roleRequirementsBySlot ? undefined : options.slotRoleRequirements?.[normalizeChemistryPosition(position)]);
}
export function isFemalePlayer(card: any): boolean {
  return [card, card.playerDef, relation(card.players), card.raw, card.raw?.playerDef, relation(card.raw?.players)].filter(Boolean)
    .some(source => ['female', 'f', '0'].includes(String(source.gender).toLowerCase()) || source.is_women === true || source.isWomen === true);
}
export function defensiveMetaPenalty(card: any, position: string, locked = false): number {
  const pos = normalizeChemistryPosition(position);
  if (locked || !['CB', 'GK'].includes(pos)) return 0;
  return passesNewCandidateFilter(card, pos, 0) ? 0 : -250;
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
  const source = card?.card ?? card?.raw ?? card;
  const minSm = req.minSm ?? req.minSkillMoves;
  const minWf = req.minWf ?? req.minWeakFoot;
  if (minSm && !(Number(source?.skill_moves ?? source?.sm) >= minSm)) return false;
  if (minWf && !(Number(source?.weak_foot ?? source?.wf) >= minWf)) return false;
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
    if (engineIcon(player)) continue;
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
  const counts = leagueDistribution(players);
  const penalty = (count: number) => count >= 6 ? -300 : 0;
  let bonus = counts.reduce((sum, count) => sum + penalty(count), 0);
  if (HYBRID_SKELETONS.some(pattern => counts.length === pattern.length && counts.every((count, i) => count === pattern[i]))) bonus += 150;
  const nations = new Map<string, number>();
  const clubs = new Map<string, number>();
  for (const player of players) {
    if (!player || player.isIcon) continue;
    const nation = player.nationId ?? player.nation_id ?? player.nation?.id;
    if (nation != null && nation !== '') nations.set(String(nation), (nations.get(String(nation)) ?? 0) + 1);
    const id = sharedClubKey(player) || (player.clubId ?? player.club_id ?? player.club?.id);
    if (id != null && id !== '') clubs.set(String(id), (clubs.get(String(id)) ?? 0) + 1);
  }
  for (const count of nations.values()) bonus += penalty(count);
  for (const count of clubs.values()) bonus += count === 2 ? 40 : count === 3 || count === 4 ? 60 : 0;
  return bonus;
}
export const evaluateSquadBalance = evaluateHybridStructure;
/** Assigned slot, rather than a card's primary position, controls midfield penalties. */
export function calculatePlayerStrength(input: any, assignedPosition?: string): number {
  const card = input.card ?? input.raw ?? input;
  const stats = relation(card.player_stats ?? card.raw?.player_stats);
  const number = (values: any[], fallback: number) => {
    const value = values.find(value => value != null && value !== '' && Number.isFinite(Number(value)));
    return value == null ? fallback : Number(value);
  };
  const pace = number([card.facePace, card.pace, card.pac, card.face_stats?.pac,
    stats.pac, card.attributeSprintSpeed, card.detail_stats?.sprint_speed, stats.sprint_speed], 70);
  const defending = number([card.faceDefending, card.def, card.stats?.def, card.face_stats?.def, stats.def], 60);
  const position = normalizeChemistryPosition(assignedPosition ?? input.slotPosition ?? input.assignedPosition ?? card.assignedPosition ?? card.position ?? '');
  const penalty = position === 'CM' && defending < 70 ? 250 : position === 'CDM' && defending < 75 ? 300 : 0;
  return pace * 1.2 - penalty;
}

/** Shared saturation-aware affiliation bonus. */
export function selectionSynergyBonus(card: PlayerCard, teammates: readonly PlayerCard[]): number {
  return anchorSynergyScore(card, teammates);
}
/** Canonical priorities retain every formation alias and repeated midfield/CB slot. */
export const DEFAULT_FILL_ORDER = ['ST', 'CF', 'CAM', 'LM', 'LW', 'RM', 'RW', 'CB', 'CM', 'CDM', 'RB', 'RWB', 'LB', 'LWB', 'GK'];
export function buildDynamicFillOrder<T extends { position: string }>(slots: readonly T[], userKeyPositions: readonly string[] = []): T[] {
  const priorities = effectivePriorityGroups(userKeyPositions, slots.map(slot => slot.position));
  const rank = (position: string) => {
    const pos = normalizeChemistryPosition(position);
    const selected = priorities.indexOf(priorityGroup(pos));
    if (selected >= 0) return selected;
    const fallback = DEFAULT_PRIORITY_GROUPS.indexOf(priorityGroup(pos));
    return priorities.length + (fallback < 0 ? 99 : fallback);
  };
  return [...slots].sort((a, b) => rank(a.position) - rank(b.position));
}
export function getAnchorSlotOrder(positions: readonly string[]): string[] {
  return buildDynamicFillOrder(positions.map(position => ({ position }))).map(slot => slot.position);
}

const LINK_RULES = { club: [3, 18], league: [5, 12], nation: [4, 8] } as const;
type LinkKind = keyof typeof LINK_RULES;
const LINK_KINDS = Object.keys(LINK_RULES) as LinkKind[];
function linkKeys(input: any): Record<LinkKind, string | null> {
  const card = input.card ?? input.raw ?? input;
  const key = (value: any) => value == null || value === '' ? null : String(value);
  return {
    club: engineIcon(input) || isCardHero(input) ? null : key(input.clubId ?? card.clubId ?? (sharedClubKey(card) || card.club_id || relation(card.club).id)),
    league: engineIcon(input) ? null : key(input.leagueId ?? card.leagueId ?? card.league_id ?? relation(card.league).id),
    nation: key(input.nationId ?? card.nationId ?? card.nation_id ?? relation(card.nation).id ?? relation(card.players).nation_id),
  };
}
function linkCounts(squad: readonly any[]) {
  const counts = { club: new Map<string, number>(), league: new Map<string, number>(), nation: new Map<string, number>() };
  for (const player of squad) {
    const keys = linkKeys(player);
    for (const kind of LINK_KINDS) {
      const id = keys[kind];
      if (id !== null) counts[kind].set(id, (counts[kind].get(id) ?? 0) + 1);
    }
  }
  return counts;
}
function linkBonus(card: any, counts: ReturnType<typeof linkCounts>, anchor?: any): number {
  const keys = linkKeys(card), target = anchor ? linkKeys(anchor) : null;
  return LINK_KINDS.reduce((score, kind) => {
    const id = keys[kind], count = id === null ? 0 : counts[kind].get(id) ?? 0;
    return score + (count > 0 && count < LINK_RULES[kind][0] && (!target || id === target[kind]) ? LINK_RULES[kind][1] : 0);
  }, 0);
}
export function anchorSynergyScore(card: PlayerCard, teammates: readonly PlayerCard[]): number {
  return linkBonus(card, linkCounts(teammates));
}
/** Saturation guides search only; actual chemistry uses the unchanged UI rules. */
export function selectDynamicAnchor(squad: readonly GeneratedPlayer[], considerManager = false,
  priorities: readonly string[] = [], formationPositions = squad.map(p => p.slotPosition)): GeneratedPlayer | null {
  if (!squad.length) return null;
  const order = buildDynamicFillOrder(formationPositions.map(position => ({ position })), priorities).map(s => s.position);
  const ranked = squad.filter(p => !engineIcon(p) && !isCardHero(p)).slice().sort((a, b) =>
    order.indexOf(a.slotPosition) - order.indexOf(b.slotPosition) || b.metaScore - a.metaScore || a.id.localeCompare(b.id));
  const primary = ranked[0];
  if (!primary) return null;
  const counts = linkCounts(squad), keys = linkKeys(primary);
  if (!(['club', 'league'] as LinkKind[]).some(kind => keys[kind] !== null
    && (counts[kind].get(keys[kind]!) ?? 0) >= LINK_RULES[kind][0])) return null;
  const chemistry = calculateSquadChemistry(squad, considerManager);
  return ranked.find(player => player !== primary && (chemistry.playerChemMap[player.id] ?? 0) < 3
    && LINK_KINDS.some(kind => {
      const id = linkKeys(player)[kind];
      return id !== null && (counts[kind].get(id) ?? 0) < LINK_RULES[kind][0];
    })) ?? null;
}

function primaryCardPosition(input: any): string {
  const card = input.card ?? input.raw ?? input;
  const rows = card.card_positions ?? [];
  const primary = rows.find((row: any) => row.is_primary);
  return relation(primary?.positions).name ?? card.position ?? card.primary_position ?? '';
}

/** Null-safe in-game scoring, using the assigned slot and object/array DB joins. */
export function calculateMetaScore(input: any, assignedPosition: string, _budget = 0): number {
  if (!input) return 0;
  return calculateBaseMetaScore(input, assignedPosition)
    + calculatePlaystyleAndSkillBonus(input, assignedPosition)
    + (normalizeChemistryPosition(assignedPosition) === 'CB'
      && primaryCardPosition(input) === 'CB' ? 10 : 0);
}
function calculateBaseMetaScore(input: any, assignedPosition: string): number {
  if (!input) return 0;
  const card = input.card ?? input.raw ?? input;
  const stats = relation(card.player_stats ?? card.raw?.player_stats);
  const sources = [card, card.raw, stats, card.detail_stats, card.face_stats].filter(Boolean);
  const read = (keys: string[], fallback: number) => {
    for (const key of keys) for (const source of sources) {
      const value = source[key];
      if (value != null && value !== '' && Number.isFinite(Number(value))) return Number(value);
    }
    return fallback;
  };
  const ovr = read(['overall'], 80), pac = read(['facePace','pac','pace','attributeSprintSpeed'], 70);
  const sho = read(['faceShooting','sho','shooting'],70), pas = read(['facePassing','pas','passing'],70), dri = read(['faceDribbling','dri','dribbling'],70);
  const def = read(['faceDefending','def','defending'],70), phy = read(['facePhysicality','phy','physicality'],70);
  const pos = normalizeChemistryPosition(assignedPosition);
  if (pos === 'GK') return ovr;
  if (['ST','CF'].includes(pos)) return ovr*.20 + pac*.35 + sho*.25 + dri*.15 + pas*.05;
  if (['LB','RB','LWB','RWB'].includes(pos)) return ovr*.15 + pac*.40 + def*.25 + phy*.20;
  if (['CM','CDM'].includes(pos)) return ovr*.15 + pas*.30 + dri*.25 + def*.15 + pac*.10 + phy*.05;
  if (pos === 'CB') return ovr*.10 + def*.35 + pac*.25 + phy*.25 + pas*.05;
  if (pos === 'CAM') return ovr*.15 + pas*.25 + dri*.25 + sho*.20 + pac*.15;
  return ovr*.15 + pac*.40 + dri*.25 + sho*.10 + pas*.10;
}

/** Price affects affordability only, never a candidate's performance score. */
export function evaluateCandidateScore(input: any, position: string, squad: readonly PlayerCard[], budget: number): number {
  return calculateMetaScore(input, position, budget) + anchorSynergyScore(input, squad);
}

export function evaluatePartialSquadCohesion(squad: readonly any[]): number {
  const counts = linkCounts(squad);
  let score = 0;
  for (const kind of LINK_KINDS) for (const count of counts[kind].values()) {
    score += Math.min(Math.max(0, count - 1), LINK_RULES[kind][0] - 1) * LINK_RULES[kind][1];
  }
  return score;
}
export function isActiveLeagueCandidate(card: PlayerCard, squad: readonly PlayerCard[]): boolean {
  const leagues = new Set(squad.filter(p => !engineIcon(p) && p.leagueId != null && p.leagueId !== '').map(p => String(p.leagueId)));
  return leagues.size <= 3 && (engineIcon(card) || leagues.has(String(card.leagueId)) || leagues.size < 3);
}

/** Dynamic pruning happens after links and hard constraints, never before. */
export function getDynamicCandidatesForSlot(position: string, squad: readonly GeneratedPlayer[], pool: readonly GeneratedPlayer[], budget: number,
  anchor: GeneratedPlayer | null = selectDynamicAnchor(squad), candidateLimit = 100, coreLeague: string | null = null, considerManager = false, minChemistryTarget = 33): GeneratedPlayer[] {
  const used = new Set(squad.map(p => p.playerKey));
  const counts = linkCounts(squad);
  const saturated = calculateSquadChemistry(squad, considerManager).totalChemistry >= minChemistryTarget;
  const buildCore = !saturated && coreLeague !== null && (counts.league.get(coreLeague) ?? 0) < 5;
  return pool.filter(p => !used.has(p.playerKey) && p.price <= budget && isActiveLeagueCandidate(p, squad)
    && isNewSelectionValid([...squad, p]))
    .map(card => {
      // Evaluate the actual completed squad, including manager/Icon effects, rather than
      // assuming that a number of Icons guarantees chemistry for every possible card.
      const reachesTarget = saturated || (squad.length === 10
        && calculateSquadChemistry([...squad, card], considerManager).totalChemistry >= minChemistryTarget);
      return { card, saturated: reachesTarget ? 1 : 0,
        score: card.metaScore + (reachesTarget ? 0 : linkBonus(card, counts, anchor)),
        core: !reachesTarget && buildCore && linkKeys(card).league === coreLeague ? 1 : 0 };
    })
    .sort((a, b) => b.saturated - a.saturated || b.core - a.core || b.score - a.score || a.card.price - b.card.price || a.card.id.localeCompare(b.card.id))
    .slice(0, candidateLimit).map(entry => entry.card);
}

/** Hard caps apply only to automatic selections, including newly selected Icons' nations. */
function withinSelectionQuota(players: readonly any[], limits: readonly number[]): boolean {
  const counts = [new Map<string, number>(), new Map<string, number>(), new Map<string, number>()];
  for (const player of players) {
    if (!player || player.isLocked) continue;
    const card = player.card ?? player.raw ?? player;
    const icon = player.card && player.slotPosition ? player.isIcon : engineIcon(player);
    const ids = [player.nationId ?? card.nation_id ?? card.nation?.id ?? relation(card.players).nation_id,
      icon ? null : player.leagueId ?? card.league_id ?? card.league?.id,
      icon ? null : (player.card && player.slotPosition ? player.clubId : sharedClubKey(player)) || (player.clubId ?? card.club_id ?? card.club?.id
        ?? card.club?.name ?? card.club_name ?? relation(card.clubs).name)];
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] == null || ids[i] === '') continue;
      const key = String(ids[i]);
      const count = (counts[i].get(key) ?? 0) + 1;
      if (count > limits[i]) return false;
      counts[i].set(key, count);
    }
  }
  return true;
}

export const isStrictSelectionValid = (players: readonly any[]) => withinSelectionQuota(players, [5, 5, 4]);
export const isRelaxedSelectionValid = (players: readonly any[]) => withinSelectionQuota(players, [6, 6, 5]);
export const isNewSelectionValid = isStrictSelectionValid;

export const WOMEN_LEAGUES = new Set([1, 6, 8, 9, 10, 15, 16, 31, 38, 44, 49, 53, 2215, 2216, 2218, 2221, 2222]);

export const PRIORITY_BUDGET_CAPS: Readonly<Record<number, number>> = {
  1: .35, 2: .25, 3: .20, 4: .16, 5: .13, 6: .10, 7: .08,
};
export const DEFAULT_BUDGET_CAP = .18;

/** Normalize only groups with unfilled slots; locked cards never consume a group cap. */
export function calculateDynamicSlotCap(position: string, unfilledPositions: readonly string[], availableBudget: number,
  priorities: readonly string[], isUnlimited = false): number {
  if (isUnlimited) return Infinity;
  if (availableBudget <= 0) return 0;
  if (!unfilledPositions.length) return availableBudget;
  const groups = [...new Set(unfilledPositions.map(priorityGroup))];
  const weight = (group: string) => {
    const rank = priorities.indexOf(group);
    return rank < 0 ? DEFAULT_BUDGET_CAP : PRIORITY_BUDGET_CAPS[rank + 1] ?? .10;
  };
  const group = priorityGroup(position);
  const rank = priorities.indexOf(group);
  const multiplier = rank === 0 ? 1.5 : rank === 1 ? 1.3 : 1.1;
  const normalized = weight(group) / groups.reduce((sum, key) => sum + weight(key), 0);
  const weightedCap = Math.floor(availableBudget * normalized * multiplier);
  const averageFloor = Math.floor(availableBudget / unfilledPositions.length * 1.3);
  return Math.min(availableBudget, Math.max(weightedCap, averageFloor));
}

export interface AnchorBudgetContext { anchorStepIndex?: number; remainingBudget?: number; remainingSlotsCount?: number; maxPriceCap?: number; }
/** Static query caps expand anchors; live caps additionally reserve funds for later slots. */
export function getPriorityPriceCap(position: string, budget: number, keyPositions: readonly string[] = [], formationPositions?: readonly string[], context: AnchorBudgetContext = {}): number {
  if (budget < 300000) return Infinity;
  const group = priorityGroup(position);
  const priorities = effectivePriorityGroups(keyPositions, formationPositions);
  const rank = priorities.indexOf(group);
  const ratio = rank >= 0 ? PRIORITY_BUDGET_CAPS[rank + 1] ?? DEFAULT_BUDGET_CAP : DEFAULT_BUDGET_CAP;
  const step = context.anchorStepIndex ?? (formationPositions
    ? buildDynamicFillOrder(formationPositions.map(position => ({ position })), keyPositions).findIndex(slot => slot.position === position)
    : rank);
  const multiplier = [1.5, 1.3, 1.1][step] ?? 1;
  const cap = Math.floor(budget * (Math.round(ratio * multiplier * 10000) / 10000));
  return step >= 3 && (context.remainingSlotsCount ?? 0) > 0
    ? Math.min(cap, Math.floor((context.remainingBudget ?? budget) / context.remainingSlotsCount! * 1.3)) : cap;
}

export function passesNewCandidateFilter(card: any, position: string, budget: number, keyPositions: readonly string[] = [], formationPositions?: readonly string[], context: AnchorBudgetContext = {}): boolean {
  if (!card) return false;
  const pos = normalizeChemistryPosition(position);
  const sourceCard = card.card ?? card.raw ?? card;
  if ((!budget || budget >= 5000000) && Number(sourceCard.overall ?? 80) < 85) return false;
  const sources = [card, sourceCard, card.raw, sourceCard.raw].filter(Boolean);
  if (sources.some(source => [source.version, source.card_type]
    .some(value => /potm|sbc/i.test(String(value ?? ''))))) return false;
  const pace = calculatePlayerStrength(sourceCard, 'ST') / 1.2;
  const price = Number(sourceCard.price ?? 0);
  if (price > (context.maxPriceCap ?? getPriorityPriceCap(position, budget, keyPositions, formationPositions, context))) return false;
  if (['ST', 'CF', 'LB', 'RB', 'LWB', 'RWB'].includes(pos) && pace < 82) return false;
  if (['CB', 'CM', 'CDM'].includes(pos)) {
    const stats = relation(sourceCard.player_stats);
    const defending = [sourceCard.faceDefending, sourceCard.def, sourceCard.stats?.def, sourceCard.face_stats?.def, stats.def]
      .find(value => value != null && value !== '' && Number.isFinite(Number(value)));
    if (Number(defending ?? 60) < (pos === 'CB' ? 80 : 70) || pace < 70) return false;
  }
  if (['ST', 'CF', 'LB', 'RB', 'LWB', 'RWB'].includes(pos)) {
    const stats = relation(sourceCard.player_stats);
    const physicality = [sourceCard.facePhysicality, sourceCard.phy, sourceCard.face_stats?.phy, stats.phy]
      .find(value => value != null && value !== '' && Number.isFinite(Number(value)));
    const highPhysicalityFloor = !budget || budget >= 500000;
    const minPhy = ['ST', 'CF'].includes(pos) ? (highPhysicalityFloor ? 70 : 66) : (highPhysicalityFloor ? 65 : 0);
    if (Number(physicality ?? 60) < minPhy) return false;
  }
  if (pos === 'CAM' && pace < 79) return false;
  if (budget >= 300000) {
    if (['LM','RM','LW','RW'].includes(pos) && pace < 85) return false;
  }
  if (!['CB', 'GK'].includes(pos)) return true;
  const source = card.card ?? card.raw ?? card;
  const league = card.leagueId ?? card.league_id ?? card.league?.id
    ?? source.leagueId ?? source.league_id ?? source.league?.id ?? relation(source.leagues).id;
  return !isFemalePlayer(card) && !isFemalePlayer(source) && !WOMEN_LEAGUES.has(Number(league));
}

/** Recheck the full selection order after a repair or upgrade changes remaining funds. */
export function fitsAnchorBudgetCaps(squad: readonly GeneratedPlayer[], budget: number, keyPositions: readonly string[] = []): boolean {
  if (budget === 0) return true;
  const positions = squad.map(p => p.slotPosition);
  const priorities = effectivePriorityGroups(keyPositions, positions);
  const order = buildDynamicFillOrder(squad.filter(p => !p.isLocked).map(player => ({ position: player.slotPosition, player })), keyPositions);
  let remaining = budget - squad.filter(p => p.isLocked).reduce((sum, p) => sum + p.price, 0);
  if (remaining < 0) return false;
  if (order.length) {
    const anchorGroup = priorityGroup(order[0].position);
    const groupCap = calculateDynamicSlotCap(order[0].position, order.map(s => s.position), remaining, priorities);
    if (order.filter(s => priorityGroup(s.position) === anchorGroup).reduce((sum, s) => sum + s.player.price, 0) > groupCap) return false;
  }
  for (const [step, slot] of order.entries()) {
    if (slot.player.price > calculateDynamicSlotCap(slot.position, order.slice(step).map(s => s.position), remaining, priorities)) return false;
    remaining -= slot.player.price;
  }
  return remaining >= 0;
}

export function calculateFinalSquadScore(squad: readonly any[], chemistry: number, budget = 0, relaxed = false, minChemistryTarget = 33): number {
  if (!(relaxed ? isRelaxedSelectionValid(squad) : isStrictSelectionValid(squad))) return -Infinity;
  if (budget > 0 && squad.reduce((sum, p) => sum + Number(p.price ?? p.card?.price ?? 0), 0) > budget) return -Infinity;
  if (chemistry < minChemistryTarget) return -20000 + chemistry * 100;
  const leagues = leagueDistribution(squad);
  if (leagues.length > 3) return -Infinity;
  return squad.reduce((sum, p) => sum + evaluateCandidateScore(p, p.slotPosition ?? p.assignedPosition ?? p.position, [], budget), 10000);
}
export function clubSynergyBonus(card: any, teammates: readonly any[]): number {
  const id = linkKeys(card).club;
  const count = id === null ? 0 : linkCounts(teammates).club.get(id) ?? 0;
  return count > 0 && count < 3 ? 18 : 0;
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
    if (!passesNewCandidateFilter(card, targetPos, 0)) baseScore -= 25;
  } else {
    baseScore = calculatePlayerStrength(card, targetPos);
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
  chemistryCard.isIcon = engineIcon(card);
  chemistryCard.isHero = isCardHero(card);
  chemistryCard.clubId = sharedClubKey(card) || chemistryCard.clubId;
  if (!isLocked && !isPositionMatched(slotPosition, chemistryCard)) return null;
  const normalized = normalizeChemistryPosition(slotPosition);
  const metaScore = calculatePlayerStrength(card, normalized);
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
 * Uses formation slot priority, affordable reserves and
 * complete-squad scoring and a time-bounded, remaining-budget chemistry repair.
 * State/inputs are never mutated; unsuccessful results explicitly describe failure.
 * Three tuple passes and a free backtracking pass share a 50,000-node / five-second search budget.
 */
export async function generateOptimalSquad(
  formation: string, candidates: CandidateGroups | CandidatePlayer[], totalBudget: number | null | undefined,
  minChemistry: number = 33, considerManager: boolean,
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

  const ownedIds = new Set(Object.values(existing).filter(entry => entry?.isOwned).map(entry => String(rawEntryCard(entry!).id)));
  const fixedPlayers = new Map<number, GeneratedPlayer>();
  layout.slots.forEach(({ position }, index) => {
    const entry = existing[position];
    if (!entry?.isLocked) return;
    const fixed = prepareCandidate(rawEntryCard(entry), position, threeBack, entry.isOwned === true, true);
    if (!fixed) throw new Error('Check the price and card details of your locked players.');
    if (!meetsRoleRequirement(rawEntryCard(entry), position, options)) throw new Error('A locked player does not meet the selected tactical requirements. Unlock it or change the tactical requirements.');
    fixed.metaScore = evaluateCandidateScore(fixed, position, [], totalBudget);
    fixedPlayers.set(index, fixed);
  });
  const specialCount = (players: GeneratedPlayer[]) => players.filter(p => (engineIcon(p) && !p.isLocked) || isCardHero(p)).length;
  if (specialCount([...fixedPlayers.values()]) > maxSpecial) throw new Error('Locked Icons / Heroes exceed the limit. Unlock players or increase the limit.');
  const fixedPlayerKeys = new Set([...fixedPlayers.values()].map(p => p.playerKey));
  if (fixedPlayerKeys.size !== fixedPlayers.size) throw new Error('The same player is locked in multiple positions.');
  const formationPositions = layout.slots.map(slot => slot.position);
  const selectionOrder = buildDynamicFillOrder(layout.slots, options.keyPositions)
    .filter(slot => !fixedPlayers.has(layout.slots.indexOf(slot))).map(slot => slot.position);
  // Repeated positions read the same full source; no rank ranges are assigned to slots.
  const owned = Object.values(existing).filter(entry => entry?.isOwned).map(entry => rawEntryCard(entry!));
  const sharedSources = new Map<string, RawCandidate[]>();
  for (const { position } of layout.slots) {
    const normalized = normalizeChemistryPosition(position);
    if (!sharedSources.has(normalized)) sharedSources.set(normalized,
      [...new Map([...(groups[getPositionBudgetGroup(position, threeBack)] ?? []), ...owned]
        .map(card => [String(card.id), card])).values()]);
  }
  const rawPools: GeneratedPlayer[][] = layout.slots.map(({ position }, index) => {
    if (fixedPlayers.has(index)) return [];
    const unique = new Map<string, GeneratedPlayer>();
    for (const card of sharedSources.get(normalizeChemistryPosition(position))!) {
      // Locked slots are restored separately via fixedPlayers, never filtered here.
      if (!passesMarketPriceFilter(card, options)) continue;

      // Exclusions and advanced requirements must precede scoring and every stage slice.
      if (excluded.has(getCardVersionId(card)) || card.overall == null || card.overall < squadOvrRange.min || card.overall > squadOvrRange.max) continue;
      if (!meetsRoleRequirement(card, position, options)) continue;
      const prepared = prepareCandidate(card, position, threeBack, ownedIds.has(String(card.id)) || card.isOwned === true);
      if (prepared && fixedPlayerKeys.has(prepared.playerKey)) continue;
      if (prepared && prepared.price > remainingTotalBudget) continue;
      if (prepared && (prepared.isIcon || prepared.isHero) && maxSpecial === 0) continue;
      if (prepared) {
        prepared.metaScore = evaluateCandidateScore(prepared, position, [], totalBudget)
          + (options.keyPositions?.map(priorityGroup).includes(priorityGroup(position)) ? 100 : 0);
        unique.set(prepared.id, prepared);
      }
    }
    const sorted = [...unique.values()].sort((a, b) =>
      b.metaScore - a.metaScore
      || a.price - b.price || a.id.localeCompare(b.id));
    const filtered = sorted.filter(p => passesNewCandidateFilter(p.card, position, totalBudget, options.keyPositions, formationPositions,
      { maxPriceCap: Infinity }));
    // Keep lower-tier legal links available for the expanded pass.
    return filtered;
  });
  const openPositions = layout.slots.filter((_, i) => !fixedPlayers.has(i)).map(slot => slot.position);
  const order = buildDynamicFillOrder(layout.slots, options.keyPositions).filter(slot => openPositions.includes(slot.position)).map(slot => layout.slots.findIndex(s => s.position === slot.position));
  if (order.length) {
    const firstPosition = priorityGroup(layout.slots[order[0]].position);
    order.sort((a, b) => Number(priorityGroup(layout.slots[b].position) === firstPosition)
      - Number(priorityGroup(layout.slots[a].position) === firstPosition));
  }
  const budgetPriorities = effectivePriorityGroups(options.keyPositions, formationPositions);
  const anchorGroupCap = order.length ? calculateDynamicSlotCap(layout.slots[order[0]].position,
    order.map(index => layout.slots[index].position), remainingTotalBudget, budgetPriorities, totalBudget === 0) : Infinity;
  const liveSlotCap = (index: number, slots: Array<GeneratedPlayer | undefined>, cost: number) =>
    calculateDynamicSlotCap(layout.slots[index].position,
      order.filter(i => !slots[i]).map(i => layout.slots[i].position), spendingLimit - cost, budgetPriorities, totalBudget === 0);
  const prioritySlots = buildDynamicFillOrder(layout.slots, options.keyPositions).map(slot => slot.position);
  const coreLeagueFor = (squad: readonly GeneratedPlayer[]) => {
    for (const position of prioritySlots) {
      const player = squad.find(p => p.slotPosition === position && !engineIcon(p) && !isCardHero(p));
      if (player) return linkKeys(player).league;
    }
    return null;
  };
  const fixedCost = [...fixedPlayers.values()].reduce((sum, p) => sum + p.price, 0);
  if (fixedCost > spendingLimit) throw new Error('Locked players exceed the target budget. Unlock players or increase the budget.');
  type State = { slots: Array<GeneratedPlayer | undefined>; cost: number };
  const initial: State = { slots: Array(11), cost: fixedCost };
  fixedPlayers.forEach((player, index) => initial.slots[index] = player);
  let bestPartial = initial;
  let iterations = 0;
  let pruned = false;
  const filled = (state: State) => state.slots.filter((p): p is GeneratedPlayer => Boolean(p));
  const evaluate = (state: State) => {
    const squad = filled(state);
    const chemistry = calculateSquadChemistry(squad, considerManager);
    return { squad, totalCost: state.cost, totalChemistry: chemistry.totalChemistry, manager: chemistry.manager,
      teamMetaScore: squad.length ? squad.reduce((sum, p) => sum + p.metaScore, 0) / squad.length : 0,
      finalScore: calculateFinalSquadScore(squad, chemistry.totalChemistry, totalBudget, false, minChemistry) };
  };
  let bestComplete: ReturnType<typeof evaluate> | null = order.length ? null : evaluate(initial);
  const choose = (a: ReturnType<typeof evaluate>, b: ReturnType<typeof evaluate>) =>
    (a.totalChemistry >= minChemistry && b.totalChemistry < minChemistry) || (a.totalChemistry >= minChemistry) === (b.totalChemistry >= minChemistry)
      && (a.finalScore > b.finalScore || a.finalScore === b.finalScore && (a.teamMetaScore > b.teamMetaScore
        || a.teamMetaScore === b.teamMetaScore && a.totalCost < b.totalCost));
  let resolverPools: GeneratedPlayer[][] = [];
  let searchStage: 1 | 2 | 3 | 4 = 1;
  const stageAttempts = [0, 0, 0, 0];
  const started = performance.now();
  const searchDeadline = started + STAGE_TIMEOUT_MS;
  // Reserve time and nodes for each expansion rather than exhausting them at 150.
  for (const [stageIndex, limit] of [150, 200, 300, 300].entries()) {
    if (bestComplete && bestComplete.totalChemistry >= minChemistry) break;
    searchStage = (stageIndex + 1) as 1 | 2 | 3 | 4;
    const deadline = started + STAGE_TIMEOUT_MS * [0.2, 0.4, 0.7, 1][stageIndex];
    const nodeLimit = [10000, 20000, 35000, MAX_BACKTRACK_ITERATIONS][stageIndex];
    const anchorPosition = order.length ? priorityGroup(layout.slots[order[0]].position) : null;
    // The fourth pass releases all anchor sets, retaining every hard constraint.
    const pools = rawPools.map(pool => pool.slice(0, limit));
    resolverPools = pools;
    const visit = (state: State, depth: number, branchDeadline = deadline, branchLimit = nodeLimit): boolean => {
      if (performance.now() >= branchDeadline || iterations >= branchLimit) { pruned = true; return false; }
      const occupied = filled(state);
      if (occupied.length > filled(bestPartial).length) bestPartial = state;
      if (depth === order.length) {
        const result = evaluate(state);
        if (!bestComplete || choose(result, bestComplete)) bestComplete = result;
        return result.totalChemistry >= minChemistry;
      }
      if (depth === 0 && stageIndex < 3) {
        const groupIndices = order.filter(index => priorityGroup(layout.slots[index].position) === anchorPosition);
        if (groupIndices.length > 0) {
          const groupCap = anchorGroupCap;
          const combinations: Array<{ state: State; score: number }> = [];
          const collect = (partial: State, offset: number, groupCost: number, score: number) => {
            if (performance.now() >= branchDeadline || iterations >= branchLimit) { pruned = true; return; }
            if (offset === groupIndices.length) { combinations.push({ state: partial, score }); return; }
            const slotIndex = groupIndices[offset];
            const players = filled(partial);
            const cap = liveSlotCap(slotIndex, partial.slots, partial.cost);
            for (const player of rawPools[slotIndex].filter(p => p.price <= cap).slice(0, groupIndices.length === 1 ? 150 : groupIndices.length === 2 ? 40 : 30)) {
              if (performance.now() >= branchDeadline || iterations >= branchLimit) { pruned = true; return; }
              if (groupCost + player.price > groupCap || player.price > cap || partial.cost + player.price > spendingLimit
                || players.some(p => p.playerKey === player.playerKey)) continue;
              const trial = [...players, player];
              if (!isNewSelectionValid(trial) || !isActiveLeagueCandidate(player, players) || specialCount(trial) > maxSpecial) continue;
              const slots = partial.slots.slice(); slots[slotIndex] = player;
              collect({ slots, cost: partial.cost + player.price }, offset + 1, groupCost + player.price, score + player.metaScore);
            }
          };
          collect(state, 0, 0, 0);
          combinations.sort((a, b) => b.score - a.score || a.state.cost - b.state.cost);
          // Different assignments of the same cards are one tuple, not separate sets.
          // Keep the best legal assignment (slot requirements and budgets were checked).
          const uniqueSets = new Map<string, typeof combinations[number]>();
          for (const combination of combinations) {
            const signature = groupIndices.map(index => combination.state.slots[index]!.id).sort().join('|');
            if (!uniqueSets.has(signature)) uniqueSets.set(signature, combination);
          }
          const topAnchorSets = [...uniqueSets.values()].slice(0, 5);
          for (const [i, combination] of topAnchorSets.entries()) {
            if (performance.now() >= branchDeadline || iterations >= branchLimit) { pruned = true; return false; }
            iterations++; stageAttempts[stageIndex]++;
            const left = topAnchorSets.length - i;
            const now = performance.now();
            if (visit(combination.state, groupIndices.length, now + (branchDeadline - now) / left,
              iterations + Math.ceil((branchLimit - iterations) / left))) return true;
          }
          return false;
        }
      }
      const index = order[depth];
      const slotCap = liveSlotCap(index, state.slots, state.cost);
      const anchor = selectDynamicAnchor(occupied, considerManager, options.keyPositions, formationPositions);
      const source = rawPools[index].filter(p => p.price <= slotCap).slice(0, limit);
      const eligible = getDynamicCandidatesForSlot(layout.slots[index].position, occupied, source,
        Math.min(slotCap, spendingLimit - state.cost), anchor, limit, stageIndex > 0 ? coreLeagueFor(occupied) : null, considerManager, minChemistry);
      // At depth zero, keep pure meta order and let the recursion return to the next ace.
      if (depth === 0) eligible.sort((a, b) => b.metaScore - a.metaScore || a.price - b.price || a.id.localeCompare(b.id));
      for (const [candidateIndex, candidate] of eligible.entries()) {
        if (performance.now() >= branchDeadline || iterations >= branchLimit) { pruned = true; return false; }
        iterations++; stageAttempts[stageIndex]++;
        const squad = [...occupied, candidate];
        const cost = state.cost + candidate.price;
        const groupCost = squad.filter(p => !p.isLocked && priorityGroup(p.slotPosition) === anchorPosition).reduce((sum, p) => sum + p.price, 0);
        if (totalBudget > 0 && groupCost > anchorGroupCap) continue;
        if (specialCount(squad) > maxSpecial) continue;
        const used = new Set(squad.map(p => p.playerKey));
        let reserve = 0;
        for (const remaining of order.slice(depth + 1)) {
          let cheapest = Infinity;
          for (const p of rawPools[remaining]) {
            if (p.price < cheapest && !used.has(p.playerKey)
              && isActiveLeagueCandidate(p, squad) && isNewSelectionValid([...squad, p])) cheapest = p.price;
          }
          reserve += cheapest;
        }
        if (!Number.isFinite(reserve) || cost + reserve > spendingLimit) continue;
        const slots = state.slots.slice(); slots[index] = candidate;
        // One difficult ace must not consume the entire stage before the next can run.
        const remainingAnchors = eligible.length - candidateIndex;
        const now = performance.now();
        const childDeadline = depth === 0 ? now + (branchDeadline - now) / remainingAnchors : branchDeadline;
        const childLimit = depth === 0 ? iterations + Math.ceil((branchLimit - iterations) / remainingAnchors) : branchLimit;
        if (visit({ slots, cost }, depth + 1, childDeadline, childLimit)) return true;
      }
      return false;
    };
    visit(initial, 0);
  }
  // Upgrades share the search deadline and preserve chemistry and the anchor-group cap.
  if (bestComplete && bestComplete.totalChemistry >= minChemistry) {
    const upgraded = upgradeSquadToTargetBudgetRatio(bestComplete.squad, totalBudget,
      Object.fromEntries(layout.slots.map((slot, index) => [slot.position, resolverPools[index] ?? []])),
      considerManager, options, minChemistry, searchDeadline);
    if (upgraded !== bestComplete.squad) {
      const slots = layout.slots.map(slot => upgraded.find(p => p.slotPosition === slot.position));
      bestComplete = evaluate({ slots, cost: upgraded.reduce((sum, p) => sum + p.price, 0) });
    }
  }
  const result = bestComplete ?? evaluate(bestPartial);
  const complete = result.squad.length === 11;
  const success = complete && result.totalChemistry >= minChemistry;
  return { ...result, success, minChemistryTarget: minChemistry, status: success ? 'success' : complete ? 'chemistry_unmet' : 'incomplete', iterations, searchLimitReached: pruned,
    searchStage, stageAttempts };
}

/** Strictly stronger replacements at any affordable price; at most 12 accepted swaps. */
export function upgradeSquadToTargetBudgetRatio(
  squad: GeneratedPlayer[], totalBudget: number, candidatePools: Record<string, readonly GeneratedPlayer[]>,
  considerManager = true, options: AutoBuildOptions = {}, minChemistryTarget = 33, deadline = Infinity,
): GeneratedPlayer[] {
  if (!Number.isFinite(totalBudget) || totalBudget < 0 || squad.length !== 11
    || calculateSquadChemistry(squad, considerManager).totalChemistry < minChemistryTarget) return squad;
  let current = squad;
  const excluded = new Set(normalizeExcludedCardVersionIds(options.excludedCardVersionIds));
  const ovrRange = validateSquadOvrRange(options.squadOvrRange);
  const maxSpecial = specialLimit(options);
  const chemistryFloor = Math.max(minChemistryTarget, calculateSquadChemistry(squad, considerManager).totalChemistry);
  const selectionOrder = buildDynamicFillOrder(squad.map(p => ({ position: p.slotPosition })), options.keyPositions)
    .filter(slot => !squad.find(p => p.slotPosition === slot.position)!.isLocked).map(slot => slot.position);
  for (let pass = 0; pass < 12; pass++) {
    const cost = current.reduce((sum, player) => sum + player.price, 0);
    const remaining = totalBudget === 0 ? Infinity : totalBudget - cost;
    const targets = current.filter(player => !player.isLocked)
      .sort((a, b) => calculateMetaScore(a, a.slotPosition, totalBudget) - calculateMetaScore(b, b.slotPosition, totalBudget)
        || a.price - b.price);
    let replaced = false;
    for (const target of targets) {
      if (performance.now() >= deadline) return current;
      const position = target.slotPosition;
      const others = current.filter(player => player !== target);
      const targetScore = calculateMetaScore(target, position, totalBudget);
      const upgrades = (candidatePools[position] ?? []).filter(candidate => {
        const card = candidate.card;
        return candidate.slotPosition === position && candidate.id !== target.id
          && passesMarketPriceFilter(card, options) && isPositionMatched(position, candidate)
          && candidate.price <= target.price + remaining
          && !others.some(player => player.playerKey === candidate.playerKey)
          && !excluded.has(getCardVersionId(card))
          && card.overall != null && card.overall >= ovrRange.min && card.overall <= ovrRange.max
          && meetsRoleRequirement(card, position, options)
          && passesNewCandidateFilter(card, position, totalBudget, options.keyPositions, squad.map(player => player.slotPosition),
            { maxPriceCap: Infinity })
          && calculateMetaScore(candidate, position, totalBudget) > targetScore;
      }).sort((a, b) => calculateMetaScore(b, position, totalBudget) - calculateMetaScore(a, position, totalBudget)
        || a.price - b.price || a.id.localeCompare(b.id)).slice(0, 175);
      for (const candidate of upgrades) {
        if (performance.now() >= deadline) return current;
        if (!isActiveLeagueCandidate(candidate, others)) continue;
        const trial = current.map(player => player === target ? candidate : player);
        if (!isStrictSelectionValid(trial) || !fitsAnchorBudgetCaps(trial, totalBudget, options.keyPositions)
          || trial.filter(player => (engineIcon(player) && !player.isLocked) || isCardHero(player)).length > maxSpecial
          || calculateSquadChemistry(trial, considerManager).totalChemistry < chemistryFloor) continue;
        current = trial;
        replaced = true;
        break;
      }
      if (replaced) break; // Recompute cost, affordability and weakest-slot order after every swap.
    }
    if (!replaced) break;
  }
  return current;
}
