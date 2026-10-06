import { calculateChemistry } from './chemistry.ts';
import type { PlayerCard, SquadSlot } from '../types/chemistry';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adaptChemistryPlayerCard, isPositionMatched, normalizeChemistryPosition } from './chemistry.ts';
import { FORMATIONS } from './formations.js';
import { getCardCoinPrice, calculateSquadTotalCost } from './squadCost.ts';
import { getCardVersionId, normalizeExcludedCardVersionIds, validateSquadOvrRange } from './excludedCardVersions.js';

export interface AutoBuildOptions {
  excludeZeroPriceCards?: boolean;
  squadOvrRange?: { min: number; max: number };
  /** card_versions.id values: other versions of the same player remain eligible. */
  excludedCardVersionIds?: Array<string | number>;
  focus?: SquadFocus;
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
  id,player_id,overall,price,version,card_type,club_id,league_id,background_url,sm,wf,preferred_foot,
  players!inner(id,name,long_name,nation_id,gender,nations(name,flag_url)),
  clubs(id,name),leagues(id,name),card_positions(is_primary,positions(name)),
  card_roles(role_level,roles(position,role_name)),
  player_stats(pac,sho,pas,dri,def,phy,acceleration,sprint_speed,agility,balance,
    finishing,composure,def_awareness,standing_tackle,strength,stamina,vision,short_passing)
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

/** Focus changes scores and search priority, never a card's spending allowance. */
export function getFocusWeight(position: string, focus: SquadFocus = 'attack', threeBack = false): number {
  if (!['attack', 'balanced', 'defense'].includes(focus)) throw new RangeError('Unknown squad focus.');
  const normalized = normalizeChemistryPosition(position);
  return (focus === 'attack' && getPositionBudgetGroup(position, threeBack) === 'FW')
    || (focus === 'defense' && ['CB', 'CDM'].includes(normalized)) ? 1.2 : 1;
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
    const queryRows = async (cap: number | null, limit: number, cheapest = false, positions = item.positions) => {
      let query = supabase.from('card_versions').select(select)
        .in('candidate_positions.positions.name', positions)
        .gte('overall', Math.max(80, squadOvrRange.min)).lte('overall', squadOvrRange.max).gte('price', 0);
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
    const perPosition = await Promise.all(item.positions.map(position =>
      queryRows(unlimited ? null : Math.max(0, remainingTotalBudget), 120, false, [position])));
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

/** Slot-specific solver score; supports API joins and normalized card inputs. */
export function calculateMetaPaceScore(card: any, targetPos: string): number {
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
  } else if (['CM', 'CDM'].includes(targetPos)) {
    const pass = (p.vision ?? f.pas ?? 70) * .5 + (p.short_passing ?? f.pas ?? 70) * .5;
    baseScore = pace * .40 + hexagonAvg * .25 + pass * .18 + ((def + phy) / 2) * .17;
  } else if (['LB', 'RB', 'LWB', 'RWB'].includes(targetPos)) {
    const pass = (p.vision ?? f.pas ?? 65) * .5 + (p.short_passing ?? f.pas ?? 65) * .5;
    baseScore = pace * .50 + def * .20 + phy * .15 + pass * .15;
  } else if (targetPos === 'CB') {
    baseScore = pace * .50 + def * .30 + phy * .20;
    // DB cards keep gender on the joined player; normalized cards may expose it directly.
    const player = relation(card.players ?? card.raw?.players);
    const gender = card.gender ?? card.raw?.gender ?? player.gender;
    const isWomen = card.is_women ?? card.raw?.is_women ?? player.is_women;
    if (gender === 'Male' || gender === 1 || gender === 'M' || isWomen === false) {
      baseScore += 5;
    }
  } else {
    baseScore = card.overall ?? 80;
  }
  // Match the actual primary position, never an unmarked alternate position.
  // Support normalized cards and both object/array Supabase relation shapes.
  const matchesPrimary = (value: unknown) => typeof value === 'string'
    && normalizeChemistryPosition(value) === targetPos;
  const hasPrimary = (source: any) => {
    if (!source) return false;
    if (matchesPrimary(source.primary_position_str ?? source.primary_position ?? source.position)) return true;
    return [source.positions, source.card_positions].some(rows => Array.isArray(rows)
      && rows.some(row => row?.is_primary && matchesPrimary(
        relation(row.positions).name ?? relation(row.position).name ?? row.position_name ?? row.name)));
  };
  const primaryBonus = hasPrimary(card) || hasPrimary(card.raw) ? 1 : 0;
  const roles = card.roles ?? card.card_roles ?? card.raw?.card_roles ?? [];
  let roleBonus = 0;
  for (const row of roles) {
    const role = row.roles ? relation(row.roles) : row;
    const name = role.role_name ?? role.name ?? '';
    const matches = role.position === targetPos || name.startsWith(targetPos);
    if (!matches) continue;
    const bonus = row.level === 2 || row.role_level === 2 ? 3
      : row.level === 1 || row.role_level === 1 ? 1.5 : 0;
    roleBonus = Math.max(roleBonus, bonus);
  }
  return baseScore + primaryBonus + roleBonus;
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
 * Uses focus-weighted DFS, actual price reserves, chemistry repair and at most two upgrades.
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
  getFocusWeight('ST', focus, threeBack); // Validate even when every slot is locked.
  const withinBudget = (players: GeneratedPlayer[]) => players.reduce((sum, player) => sum + player.price, 0) <= spendingLimit;
  const ownedIds = new Set(Object.values(existing).filter(entry => entry?.isOwned).map(entry => String(rawEntryCard(entry!).id)));
  const fixedPlayers = new Map<number, GeneratedPlayer>();
  layout.slots.forEach(({ position }, index) => {
    const entry = existing[position];
    if (!entry?.isLocked) return;
    const fixed = prepareCandidate(rawEntryCard(entry), position, threeBack, entry.isOwned === true, true);
    if (!fixed) throw new Error('Check the price and card details of your locked players.');
    fixed.metaScore *= getFocusWeight(position, focus, threeBack);
    fixedPlayers.set(index, fixed);
  });
  const specialCount = (players: GeneratedPlayer[]) => players.filter(p => p.isIcon || p.isHero).length;
  if (specialCount([...fixedPlayers.values()]) > maxSpecial) throw new Error('Locked Icons / Heroes exceed the limit. Unlock players or increase the limit.');
  if (new Set([...fixedPlayers.values()].map(p => p.playerKey)).size !== fixedPlayers.size) throw new Error('The same player is locked in multiple positions.');
  const pools: GeneratedPlayer[][] = layout.slots.map(({ position }) => {
    const unique = new Map<string, GeneratedPlayer>();
    const owned = Object.values(existing).filter(entry => entry?.isOwned).map(entry => rawEntryCard(entry!));
    for (const card of [...(groups[getPositionBudgetGroup(position, threeBack)] ?? []), ...owned]) {
      // Locked slots are restored separately via fixedPlayers, never filtered here.
      if (!passesMarketPriceFilter(card, options)) continue;
      if (excluded.has(getCardVersionId(card)) || card.overall == null || card.overall < squadOvrRange.min || card.overall > squadOvrRange.max) continue;
      const prepared = prepareCandidate(card, position, threeBack, ownedIds.has(String(card.id)) || card.isOwned === true);
      if (prepared && prepared.price > remainingTotalBudget) continue;
      if (prepared && (prepared.isIcon || prepared.isHero) && maxSpecial === 0) continue;
      if (prepared) {
        prepared.metaScore *= getFocusWeight(position, focus, threeBack);
        unique.set(prepared.id, prepared);
      }
    }
    return [...unique.values()].sort((a, b) => b.metaScore - a.metaScore || a.price - b.price || a.id.localeCompare(b.id));
  });
  const order = pools.map((_, i) => i).filter(i => !fixedPlayers.has(i)).sort((a, b) =>
    getFocusWeight(layout.slots[b].position, focus, threeBack) - getFocusWeight(layout.slots[a].position, focus, threeBack)
    || pools[a].length - pools[b].length || a - b);
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
  async function build(depth: number, cost: number, requireChemistry: boolean, stopAt: number): Promise<boolean> {
    const filled = selected.filter((p): p is GeneratedPlayer => Boolean(p));
    if (filled.length > partial.length) partial = [...filled];
    if (depth === order.length) return !requireChemistry
      || calculateSquadChemistry(filled, considerManager).totalChemistry >= minChemistry;
    const index = order[depth];
    const orderedPool = pools[index];
    for (const card of orderedPool) {
      if (iterations >= stopAt) return false;
      await tick();
      if (usedPlayers.has(card.playerKey) || usedCards.has(card.id)) continue;
      if (specialCount([...filled, card]) > maxSpecial || !withinBudget([...filled, card])) continue;
      {

        // Optimistic reserve: each remaining slot needs at least its cheapest unused card.
        let reserve = 0;
        for (const next of order.slice(depth + 1)) {
          const prices = pools[next].filter(p => p.playerKey !== card.playerKey && p.id !== card.id
            && !usedPlayers.has(p.playerKey) && !usedCards.has(p.id)).map(p => p.price);
          const minimum = prices.length ? Math.min(...prices) : Infinity;
          reserve += minimum;
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
  let complete = await build(0, fixedCost, true, 350);
  if (!complete) {
    pools.forEach(pool => pool.sort((a, b) => a.price - b.price || b.metaScore - a.metaScore));
    complete = await build(0, fixedCost, false, 800);
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
    return a.teamMetaScore > b.teamMetaScore || (a.teamMetaScore === b.teamMetaScore && a.totalCost < b.totalCost);
  }
  // Seed affiliation clusters to cross multi-player chemistry thresholds within budget.
  const clusterPools = pools;
  const affiliationKeys = ['leagueId', 'nationId', 'clubId'] as const;
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
        if (iterations >= 1100) break;
        await tick();
        const occupied = trialSlots.filter((p): p is GeneratedPlayer => Boolean(p));
        const eligible = clusterPools[index].filter(p => !occupied.some(other => other.id === p.id || other.playerKey === p.playerKey)
          && specialCount([...occupied, p]) <= maxSpecial && withinBudget([...occupied, p]));
        const links = (p: GeneratedPlayer) => affinity([...occupied, p]) - affinity(occupied)
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
      const weakest = order.slice().sort((a, b) => current.squad[a].metaScore - current.squad[b].metaScore
        || current.squad[a].price - current.squad[b].price);
      for (const i of weakest) {
        const previous = current.squad[i];
        const available = spendingLimit - current.totalCost + previous.price;
        const occupied = current.squad.filter((_, index) => index !== i);
        for (const candidate of pools[i].slice().sort((a, b) => b.metaScore - a.metaScore || a.price - b.price)) {
          if (iterations >= upgradeLimit) break;
          if (candidate.metaScore <= previous.metaScore || candidate.price > available
            || occupied.some(p => p.id === candidate.id || p.playerKey === candidate.playerKey)) continue;
          await tick();
          const squad = current.squad.slice(); squad[i] = candidate;
          if (specialCount(squad) > maxSpecial || !withinBudget(squad)) continue;
          const trial = evaluate(squad);
          if (trial.totalChemistry < minChemistry) continue;
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
