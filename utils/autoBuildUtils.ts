import { calculateChemistry } from './chemistry.ts';
import type { PlayerCard, SquadSlot } from '../types/chemistry';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adaptChemistryPlayerCard, isPositionMatched, normalizeChemistryPosition } from './chemistry.ts';
import { calculate_base_score } from './metaScore.js';
import { FORMATIONS } from './formations.js';
import { PLAYER_CARD_SELECT } from './playerCards.js';
import { getCardCoinPrice, calculateSquadTotalCost } from './squadCost.ts';

export interface AutoBuildOptions {
  budgetAllocations?: BudgetAllocations;
  currentSquad?: Record<string, { card: Record<string, any>; isOwned?: boolean; isLocked?: boolean } | null>;
  /** Combined Icon/Hero maximum. null/undefined means unlimited (11). */
  maxSpecialCards?: number | null;
}
function specialLimit(options: AutoBuildOptions): number {
  const limit = options.maxSpecialCards ?? 11;
  if (!Number.isInteger(limit) || limit < 0 || limit > 11) throw new RangeError('아이콘 / 히어로 제한은 0~11명이어야 합니다.');
  return limit;
}
function rawEntryCard(entry: NonNullable<NonNullable<AutoBuildOptions['currentSquad']>[string]>) {
  return entry.card.raw ?? entry.card;
}
function isSpecialCard(card: Record<string, any>): boolean {
  const type = String(card.card_type ?? card.cardType ?? '').toUpperCase();
  return type ? ['ICON', 'SPECIAL_ICON', 'HERO', 'SPECIAL_HERO'].includes(type) : Boolean(card.isIcon || card.isHero);
}

export type BudgetGroup = 'FW' | 'MF' | 'DF';
export type BudgetAllocations = Record<BudgetGroup, number>;
const CANDIDATE_LIMITS = { FW: 20, MF: 20, DF: 30 };

export function getPositionBudgetGroup(position: string, isThreeBack: boolean): BudgetGroup {
  const normalized = normalizeChemistryPosition(position);
  if (['ST', 'CF', 'LW', 'RW', 'CAM'].includes(normalized)) return 'FW';
  if (['LM', 'RM'].includes(normalized)) return isThreeBack ? 'MF' : 'FW';
  if (['CM', 'CDM'].includes(normalized)) return 'MF';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB', 'GK'].includes(normalized)) return 'DF';
  throw new Error(`지원하지 않는 포지션: ${position}`);
}

/** Locked purchases consume the total budget, never the allocations for open slots. */
export function getRemainingAutoBuildBudget(totalBudget: number | null | undefined, formation: string, options: AutoBuildOptions = {}) {
  totalBudget = totalBudget ?? 0;
  if (!Number.isFinite(totalBudget) || totalBudget < 0) throw new RangeError('총예산은 0 이상의 유한한 숫자여야 합니다.');
  const layout = FORMATIONS.find(item => item.name === formation);
  if (!layout) throw new Error(`지원하지 않는 포메이션: ${formation}`);
  const lockedCost = layout.slots.reduce((sum, slot) => {
    const entry = options.currentSquad?.[slot.position];
    return sum + (entry?.isLocked && !entry.isOwned ? getCardCoinPrice(rawEntryCard(entry)) : 0);
  }, 0);
  const unlimited = totalBudget === 0;
  // Unlimited has no finite amount to distribute in the UI; the solver uses Infinity.
  return { lockedCost, unlimited, remainingTotalBudget: unlimited ? Infinity : totalBudget - lockedCost,
    distributableBudget: unlimited ? 0 : Math.max(0, totalBudget - lockedCost) };
}

export function getCandidateBudgetPlan(totalBudget: number | null | undefined, budgetAllocations: BudgetAllocations, formation: string, isThreeBack: boolean, options: AutoBuildOptions = {}) {
  const groups: BudgetGroup[] = ['FW', 'MF', 'DF'];
  const { remainingTotalBudget, distributableBudget, unlimited } = getRemainingAutoBuildBudget(totalBudget, formation, options);
  if (!unlimited && (groups.some(group => !Number.isFinite(budgetAllocations[group]) || budgetAllocations[group] < 0)
    || groups.reduce((sum, group) => sum + budgetAllocations[group], 0) > distributableBudget)) {
    throw new RangeError('포지션별 예산은 0 이상이며 합계가 총 잔여 예산을 넘을 수 없습니다.');
  }
  const layout = FORMATIONS.find(item => item.name === formation)!;
  if (isThreeBack !== formation.startsWith('3')) throw new Error('포메이션과 isThreeBack 값이 일치하지 않습니다.');
  return groups.map(group => {
    const remaining = layout.slots.filter(slot => getPositionBudgetGroup(slot.position, isThreeBack) === group
      && !options.currentSquad?.[slot.position]?.isLocked);
    const positions = [...new Set<string>(remaining.map(slot => normalizeChemistryPosition(slot.position)))];
    const targetBudget = budgetAllocations[group];
    return { group, positions, slotCount: remaining.length, targetBudget, remainingBudget: targetBudget, remainingTotalBudget,
      averageBudget: remaining.length ? targetBudget / remaining.length : 0,
      priceCap: unlimited ? null : Math.floor(targetBudget), limit: CANDIDATE_LIMITS[group] };
  });
}

export type CandidatePlayer = Record<string, unknown> & {
  id: string | number;
  candidateGroups: BudgetGroup[];
};

/**
 * Returns raw UI-compatible card_versions rows, retaining full card_positions and relations.
 * candidateGroups records which group's price/position constraints the card passed.
 * Overall is the persisted ranking metric; metaScore is currently computed client-side.
 * Price 0 is allowed; null/negative prices are excluded. Exhausted budgets use a
 * row-limited cheapest-card fallback. This is not a guarantee of a feasible squad.
 */
export async function fetchCandidatePlayers(
  totalBudget: number | null | undefined, budgetAllocations: BudgetAllocations, formation: string,
  isThreeBack: boolean, supabase: SupabaseClient,
  options: AutoBuildOptions = {},
): Promise<CandidatePlayer[]> {
  const plan = getCandidateBudgetPlan(totalBudget, budgetAllocations, formation, isThreeBack, options);
  const maxSpecial = specialLimit(options);
  const entries = Object.entries(options.currentSquad ?? {}).filter(([, entry]) => entry?.card);
  const locked = entries.filter(([, entry]) => entry!.isLocked);
  const lockedSpecial = locked.filter(([, entry]) => isSpecialCard(rawEntryCard(entry!))).length;
  if (lockedSpecial > maxSpecial) throw new Error('잠긴 아이콘 / 히어로 선수가 설정한 제한보다 많습니다. 잠금을 해제하거나 제한을 늘려주세요.');
  if (!supabase) throw new Error('Supabase 연결 설정이 없습니다.');
  // A separate inner-join alias filters parents without truncating the full position list.
  const select = `${PLAYER_CARD_SELECT}, candidate_positions:card_positions!inner(positions!inner(name))`;
  const results = await Promise.all(plan.map(async item => {
    if (item.slotCount <= 0) return { group: item.group, rows: [] };
    const queryRows = async (cap: number | null, limit: number, cheapest = false, positions = item.positions) => {
      let query = supabase.from('card_versions').select(select)
        .in('candidate_positions.positions.name', positions).gte('price', 0);
      if (cap !== null) query = query.lte('price', cap);
      if (lockedSpecial >= maxSpecial) query = query.or('card_type.is.null,card_type.not.in.(ICON,SPECIAL_ICON,HERO,SPECIAL_HERO)');
      if (cheapest) query = query.order('price', { ascending: true });
      const { data, error } = await query.order('overall', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true }).limit(limit);
      if (error) throw new Error(item.group + ' 후보 조회 실패: ' + error.message, { cause: error });
      return data ?? [];
    };
    const exhausted = item.priceCap !== null && item.priceCap <= 0;
    let data = await queryRows(exhausted ? 10000 : item.priceCap, exhausted ? 20 : item.limit);
    // Keep cheap alternatives for every open position, even when the high-OVR
    // top-N is full. Allocations are soft guides; rare positions must not starve.
    const reserves = await Promise.all(item.positions.map(position => queryRows(null, 20, true, [position])));
    // Unlimited searches also need strong candidates for each individual position.
    const topByPosition = item.priceCap === null
      ? await Promise.all(item.positions.map(position => queryRows(null, 30, false, [position]))) : [];
    data = [...new Map([...data, ...reserves.flat(), ...topByPosition.flat()].map(row => [row.id, row])).values()]
      .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
    return { group: item.group, rows: data ?? [] };
  }));
  const candidates = new Map<string, CandidatePlayer>();
  for (const { group, rows } of results) {
    for (const row of rows) {
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
    if (isSpecialCard(card) && lockedSpecial >= maxSpecial && !entry!.isLocked) continue;
    const candidateGroups = plan.filter(item => item.positions.some(position => prepareCandidate(card, position, isThreeBack, true))).map(item => item.group);
    candidates.set(String(card.id), { ...card, candidateGroups, isOwned: true } as CandidatePlayer);
  }
  return [...candidates.values()];
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
  const stats = card.player_stats ? relation(card.player_stats) : card;
  const normalized = normalizeChemistryPosition(slotPosition);
  const metaScore = calculate_base_score(stats, card, normalized, threeBack).meta_score;
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
 * Uses scarce-slot-first greedy DFS, price reserve pruning, then local replacements.
 * State/inputs are never mutated; unsuccessful results explicitly describe failure.
 * At most 1,500 search nodes/replacement evaluations; yields every 20 operations.
 */
export async function generateOptimalSquad(
  formation: string, candidates: CandidateGroups | CandidatePlayer[], totalBudget: number | null | undefined,
  minChemistry: number, considerManager: boolean,
  options: AutoBuildOptions = {},
): Promise<GeneratedSquad> {
  const layout = FORMATIONS.find(item => item.name === formation);
  if (!layout) throw new Error(`지원하지 않는 포메이션: ${formation}`);
  totalBudget = totalBudget ?? 0;
  if (!Number.isFinite(totalBudget) || totalBudget < 0) throw new RangeError('예산은 0 이상이어야 합니다.');
  const spendingLimit = totalBudget === 0 ? Infinity : totalBudget;
  if (!Number.isInteger(minChemistry) || minChemistry < 0 || minChemistry > 33) throw new RangeError('케미스트리는 0~33이어야 합니다.');
  const groups = Array.isArray(candidates) ? groupCandidatePlayers(candidates) : candidates;
  const threeBack = formation.startsWith('3');
  const maxSpecial = specialLimit(options);
  const existing = options.currentSquad ?? {};
  // Only the total budget is a hard spending constraint in the solver.
  const { remainingTotalBudget } = getRemainingAutoBuildBudget(totalBudget, formation, options);
  const ownedIds = new Set(Object.values(existing).filter(entry => entry?.isOwned).map(entry => String(rawEntryCard(entry!).id)));
  const fixedPlayers = new Map<number, GeneratedPlayer>();
  layout.slots.forEach(({ position }, index) => {
    const entry = existing[position];
    if (!entry?.isLocked) return;
    const fixed = prepareCandidate(rawEntryCard(entry), position, threeBack, entry.isOwned === true, true);
    if (!fixed) throw new Error('잠긴 선수의 가격 또는 카드 정보를 확인해 주세요.');
    fixedPlayers.set(index, fixed);
  });
  const specialCount = (players: GeneratedPlayer[]) => players.filter(p => p.isIcon || p.isHero).length;
  if (specialCount([...fixedPlayers.values()]) > maxSpecial) throw new Error('잠긴 아이콘 / 히어로 선수가 설정한 제한보다 많습니다. 잠금을 해제하거나 제한을 늘려주세요.');
  if (new Set([...fixedPlayers.values()].map(p => p.playerKey)).size !== fixedPlayers.size) throw new Error('잠긴 선수 중 동일한 선수가 중복되어 있습니다.');
  const pools: GeneratedPlayer[][] = layout.slots.map(({ position }) => {
    const unique = new Map<string, GeneratedPlayer>();
    const owned = Object.values(existing).filter(entry => entry?.isOwned).map(entry => rawEntryCard(entry!));
    for (const card of [...(groups[getPositionBudgetGroup(position, threeBack)] ?? []), ...owned]) {
      const prepared = prepareCandidate(card, position, threeBack, ownedIds.has(String(card.id)) || card.isOwned === true);
      if (prepared && (prepared.isIcon || prepared.isHero) && maxSpecial === 0) continue;
      if (prepared) unique.set(prepared.id, prepared);
    }
    return [...unique.values()].sort((a, b) => b.metaScore - a.metaScore || a.price - b.price || a.id.localeCompare(b.id));
  });
  const order = pools.map((_, i) => i).filter(i => !fixedPlayers.has(i)).sort((a, b) => pools[a].length - pools[b].length || a - b);
  let iterations = 0;
  const maxIterations = 1500;
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
  async function build(depth: number, cost: number, enforceBudget: boolean, stopAt: number): Promise<boolean> {
    const filled = selected.filter((p): p is GeneratedPlayer => Boolean(p));
    if (filled.length > partial.length) partial = [...filled];
    if (depth === order.length) return true;
    const index = order[depth];
    for (const card of pools[index]) {
      if (iterations >= stopAt) return false;
      await tick();
      if (usedPlayers.has(card.playerKey) || usedCards.has(card.id)) continue;
      if (specialCount([...filled, card]) > maxSpecial) continue;
      if (enforceBudget) {
        // Optimistic reserve: each remaining slot needs at least its cheapest unused card.
        let reserve = 0;
        for (const next of order.slice(depth + 1)) {
          const prices = pools[next].filter(p => p.playerKey !== card.playerKey && p.id !== card.id
            && !usedPlayers.has(p.playerKey) && !usedCards.has(p.id)).map(p => p.price);
          reserve += prices.length ? Math.min(...prices) : Infinity;
        }
        if (cost - fixedCost + card.price + reserve > remainingTotalBudget) continue;
      }
      selected[index] = card;
      usedPlayers.add(card.playerKey); usedCards.add(card.id);
      if (await build(depth + 1, cost + card.price, enforceBudget, stopAt)) return true;
      selected[index] = undefined;
      usedPlayers.delete(card.playerKey); usedCards.delete(card.id);
    }
    return false;
  }
  let complete = await build(0, fixedCost, true, 350);
  const usedFallback = !complete;
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
  // Keep chemistry repairs in a cheap envelope rather than buying premium cards.
  const fallbackLimit = usedFallback ? fixedCost + (current.totalCost - fixedCost) * 1.25 : spendingLimit;
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
    const aq = quality(a), bq = quality(b);
    if (aq[0] !== bq[0]) return aq[0] < bq[0];
    if (aq[1] !== bq[1]) return aq[1] < bq[1];
    // Shared affiliations help cross thresholds even when a single swap adds no chemistry.
    if (aq[1] > 0) {
      const delta = affinity(a.squad) - affinity(b.squad);
      if (delta) return delta > 0;
    }
    if (usedFallback && a.totalCost !== b.totalCost) return a.totalCost < b.totalCost;
    return a.teamMetaScore > b.teamMetaScore || (a.teamMetaScore === b.teamMetaScore && a.totalCost < b.totalCost);
  }
  // Seed several affiliation clusters so swaps can cross multi-player chemistry thresholds.
  // In fallback mode only near-cheapest cards participate in these greedy builds.
  const clusterPools = pools.map(pool => {
    const minimum = pool.length ? Math.min(...pool.map(p => p.price)) : 0;
    return usedFallback ? pool.filter(p => p.price <= minimum * 1.25) : pool;
  });
  const affiliationKeys = ['leagueId', 'nationId', 'clubId'] as const;
  const seeds = new Map<string, { key: typeof affiliationKeys[number]; id: string; slots: Set<number> }>();
  clusterPools.forEach((pool, index) => pool.forEach(player => affiliationKeys.forEach(key => {
    const id = player[key];
    if (id == null || id === '') return;
    const token = `${key}:${id}`;
    if (!seeds.has(token)) seeds.set(token, { key, id: String(id), slots: new Set() });
    seeds.get(token)!.slots.add(index);
  })));
  if (complete && (usedFallback || current.totalChemistry < minChemistry)) {
    for (const seed of [...seeds.values()].sort((a, b) => b.slots.size - a.slots.size).slice(0, 8)) {
      const trialSlots: Array<GeneratedPlayer | undefined> = Array(11);
      fixedPlayers.forEach((player, index) => trialSlots[index] = player);
      for (const index of order) {
        if (iterations >= 1100) break;
        await tick();
        const occupied = trialSlots.filter((p): p is GeneratedPlayer => Boolean(p));
        const eligible = clusterPools[index].filter(p => !occupied.some(other => other.id === p.id || other.playerKey === p.playerKey)
          && specialCount([...occupied, p]) <= maxSpecial);
        const links = (p: GeneratedPlayer) => affinity([...occupied, p]) - affinity(occupied)
          + (String(p[seed.key]) === seed.id ? 4 : 0);
        eligible.sort((a, b) => links(b) - links(a) || (usedFallback ? a.price - b.price : b.metaScore - a.metaScore)
          || a.id.localeCompare(b.id));
        if (!eligible.length) break;
        trialSlots[index] = eligible[0];
      }
      if (trialSlots.filter(Boolean).length !== 11) continue;
      const trial = evaluate(trialSlots as GeneratedPlayer[]);
      if (better(trial, current)) current = trial;
    }
  }
  while (complete && iterations < maxIterations) {
    let next = current;
    const priority = current.squad.map((_, i) => i).sort((a, b) => current.totalCost > fallbackLimit
      ? current.squad[b].price / Math.max(1, current.squad[b].metaScore) - current.squad[a].price / Math.max(1, current.squad[a].metaScore)
      : current.playerChemMap[current.squad[a].id] - current.playerChemMap[current.squad[b].id]);
    search: for (const i of priority) {
      if (fixedPlayers.has(i)) continue;
      const occupied = current.squad.filter((_, index) => index !== i);
      const pool = pools[i].slice().sort((a, b) => usedFallback ? a.price - b.price : b.metaScore - a.metaScore);
      for (const candidate of pool) {
        if (iterations >= maxIterations) break search;
        await tick();
        if (candidate.id === current.squad[i].id || occupied.some(p => p.id === candidate.id || p.playerKey === candidate.playerKey)) continue;
        const squad = current.squad.slice(); squad[i] = candidate;
        if (specialCount(squad) > maxSpecial) continue;
        const trial = evaluate(squad);
        if (better(trial, next)) next = trial;
      }
    }
    if (next === current) break;
    current = next;
  }
  const success = complete && current.totalCost <= spendingLimit && current.totalChemistry >= minChemistry;
  const { playerChemMap: _map, ...result } = current;
  return { ...result, success, status: success ? 'success' : complete ? 'fallback' : 'incomplete',
    iterations, searchLimitReached: iterations >= maxIterations };
}
