import { adaptChemistryPlayerCard, calculateChemistry, prepareChemistryDelta, isPositionMatched, normalizeChemistryPosition } from './chemistry.ts';
import { calculate_base_score } from './metaScore.js';
import { isCardIcon, isCardHero } from './specialCardIdentity.js';
import { PLAYER_CARD_SELECT } from './playerCards.js';
import { calculateSquadTotalCost, getCardCoinPrice } from './squadCost.ts';

const female = card => /women|female|^f$|^0$/i.test(String(card.gender ?? ''));
const swapIcon = card => isCardIcon(card) || [card?.league, card?.club, card?.leagues?.name, card?.clubs?.name]
  .some(name => /^icons?$/i.test(String(name ?? '').trim()));

export function getSwapConflicts(squad, targetPosition, settings = {}) {
  const fixed = Object.entries(squad).filter(([position, entry]) => position !== targetPosition && entry?.card);
  return [['Hero', settings.maxHeroes, isCardHero], ['Icon', settings.maxIcons, swapIcon]]
    .filter(([, limit, test]) => limit === 0 && fixed.some(([, entry]) => test(entry.card)))
    .map(([kind]) => kind);
}

export function getPlayerTier(card) {
  if (swapIcon(card) || isCardHero(card)) return 2;
  return Number(card.overall ?? 0) >= 75 ? 1 : 3;
}

// All returned rows already meet the user's chemistry target.
const swapOrder = (a, b) => Number(b.card.overall ?? 0) - Number(a.card.overall ?? 0)
  || b.valueScore - a.valueScore
  || getCardCoinPrice(a.card) - getCardCoinPrice(b.card)
  || String(a.card.id).localeCompare(String(b.card.id));

export function findSwapManager(slots, currentManager, target) {
  let result = calculateChemistry(slots, currentManager);
  let bestManager = currentManager;
  if (result.totalChemistry >= target) return { result, bestManager };
  const players = slots.filter(slot => isPositionMatched(slot.position, slot.player)).map(slot => slot.player);
  const leagues = [...new Set(players.map(player => player.leagueId).filter(Boolean))];
  const nations = [...new Set(players.map(player => player.nationId).filter(Boolean))];
  for (const leagueId of leagues.length ? leagues : ['']) {
    for (const nationId of nations.length ? nations : ['']) {
      if (currentManager?.leagueId === leagueId && currentManager?.nationId === nationId) continue;
      const manager = { leagueId, nationId, league: leagueId, nation: nationId };
      const next = calculateChemistry(slots, manager);
      if (next.totalChemistry > result.totalChemistry) {
        result = next;
        bestManager = manager;
      }
      if (result.totalChemistry === 33) return { result, bestManager };
    }
  }
  return { result, bestManager };
}

function prepareSwap({ squad, targetPosition, manager = null, settings = {}, minChemistryTarget = 33,
  maxBudget = 0, minPrice = '', maxPrice = '' }) {
  if (!squad[targetPosition]?.card) return null;
  const entries = Object.entries(squad).filter(([, entry]) => entry?.card);
  const fixed = entries.filter(([position]) => position !== targetPosition);
  const used = new Set(entries.map(([, entry]) => String(entry.card.id)));
  const excluded = new Set((settings.excludedCardVersionIds ?? []).map(String));
  const remaining = maxBudget > 0 ? maxBudget - calculateSquadTotalCost(Object.fromEntries(fixed)) : Infinity;
  const femaleCount = fixed.filter(([, entry]) => female(entry.card)).length;
  const iconCount = fixed.filter(([, entry]) => swapIcon(entry.card)).length;
  const femaleCap = settings.maxFemalePlayers === 'exclude' ? 0 : settings.maxFemalePlayers;
  const temporary = fixed.map(([position, entry]) => ({ position, player: adaptChemistryPlayerCard(entry.card) }));
  const currentDelta = prepareChemistryDelta(temporary, manager);
  const unmanagedDelta = manager ? prepareChemistryDelta(temporary) : currentDelta;
  const validPlayers = temporary.filter(slot => isPositionMatched(slot.position, slot.player)).map(slot => slot.player);
  const fixedLeagues = [...new Set(validPlayers.map(player => player.leagueId).filter(Boolean))];
  const fixedNations = [...new Set(validPlayers.map(player => player.nationId).filter(Boolean))];
  const findManager = player => {
    let result = currentDelta(player);
    let bestManager = manager;
    if (result.totalChemistry >= minChemistryTarget) return { result, bestManager };
    const leagues = [...new Set([...fixedLeagues, player.leagueId].filter(Boolean))];
    const nations = [...new Set([...fixedNations, player.nationId].filter(Boolean))];
    for (const leagueId of leagues.length ? leagues : ['']) {
      for (const nationId of nations.length ? nations : ['']) {
        if (manager?.leagueId === leagueId && manager?.nationId === nationId) continue;
        const nextManager = { leagueId, nationId, league: leagueId, nation: nationId };
        const next = unmanagedDelta(player, nextManager);
        if (next.totalChemistry > result.totalChemistry) {
          result = next;
          bestManager = nextManager;
        }
        if (result.totalChemistry === 33) return { result, bestManager };
      }
    }
    return { result, bestManager };
  };
  const seen = new Set();
  return {
    eligible(card) {
      // Lightweight eligibility and affordability run before chemistry or scoring.
      const positions = card.alt_positions ?? card.secondary_positions ?? card.altPositions ?? [];
      const altPositions = Array.isArray(positions) ? positions : String(positions).replace(/[{}"\[\]]/g, '').split(',');
      if (!isPositionMatched(targetPosition, { position: card.position ?? card.primary_position, altPositions })) return null;
      const price = getCardCoinPrice(card);
      if (price > remaining || (minPrice !== '' && minPrice != null && price < Number(minPrice))
        || (maxPrice !== '' && maxPrice != null && price > Number(maxPrice))) return null;
      const id = String(card.id);
      if (used.has(id) || excluded.has(id) || seen.has(id)) return null;
      seen.add(id);
      if (settings.squadOvrRange && (card.overall < settings.squadOvrRange.min || card.overall > settings.squadOvrRange.max)) return null;
      if (typeof femaleCap === 'number' && femaleCount + Number(female(card)) > femaleCap) return null;
      if (settings.maxHeroes === 0 && isCardHero(card)) return null;
      const icon = swapIcon(card);
      if (icon && (settings.maxIcons === 0 || (typeof settings.maxIcons === 'number' && iconCount + 1 > settings.maxIcons))) return null;
      return { card, icon };
    },
    evaluate({ card, icon }) {
      const player = adaptChemistryPlayerCard(card);
      if (icon) player.isIcon = true;
      const target = minChemistryTarget;
      const { result, bestManager } = findManager(player);
      if (result.totalChemistry < target) return null;
      return { card, bestManager, isIcon: icon,
        totalChemistry: result.totalChemistry, playerChemistry: result.playerChemistry };
    },
  };
}

function rankAlternatives(candidates, position) {
  const scored = candidates.map(row => {
    const score = calculate_base_score(row.card, row.card, normalizeChemistryPosition(position), false);
    return { ...row, cardScore: score.meta_score, valueScore: score.value_score };
  });
  // Grade first, then display the shortlist by OVR and value.
  return scored.sort((a, b) => b.cardScore - a.cardScore || swapOrder(a, b)).slice(0, 30).sort(swapOrder);
}

export function suggestAlternativePlayers(options) {
  const prepared = prepareSwap(options);
  if (!prepared) return [];
  const qualified = [];
  const eligible = options.candidates.map(card => prepared.eligible(card)).filter(Boolean);
  for (const candidate of eligible.filter(({ card }) => Number(card.overall) >= 80)) {
    const row = prepared.evaluate(candidate);
    if (row) qualified.push(row);
  }
  if (qualified.length <= 2) {
    for (const candidate of eligible.filter(({ card }) => Number(card.overall) >= 75 && Number(card.overall) < 80)) {
      const row = prepared.evaluate(candidate);
      if (row) qualified.push(row);
    }
  }
  return rankAlternatives(qualified, options.targetPosition);
}

export async function suggestAlternativePlayersAsync(options, signal) {
  signal?.throwIfAborted();
  const prepared = prepareSwap(options);
  if (!prepared) return [];
  const qualified = [];
  const eligible = [];
  let lastYield = performance.now();
  const yieldIfNeeded = async () => {
    if (performance.now() - lastYield < 8) return;
    await new Promise(resolve => setTimeout(resolve, 0));
    signal?.throwIfAborted();
    lastYield = performance.now();
  };
  for (const card of options.candidates) {
    const candidate = prepared.eligible(card);
    if (candidate) eligible.push(candidate);
    if (performance.now() - lastYield >= 8) await yieldIfNeeded();
  }
  for (const candidate of eligible.filter(({ card }) => Number(card.overall) >= 80)) {
    const row = prepared.evaluate(candidate);
    if (row) qualified.push(row);
    if (performance.now() - lastYield >= 8) await yieldIfNeeded();
  }
  if (qualified.length <= 2) {
    for (const candidate of eligible.filter(({ card }) => Number(card.overall) >= 75 && Number(card.overall) < 80)) {
      const row = prepared.evaluate(candidate);
      if (row) qualified.push(row);
      if (performance.now() - lastYield >= 8) await yieldIfNeeded();
    }
  }
  return rankAlternatives(qualified, options.targetPosition);
}
// One joined request per OVR band; chemistry and manager evaluation never fetch.
export async function fetchAlternativeCards(db, position, signal, {
  minOverall = 80, maxOverallExclusive, maxPrice = Infinity, minPrice = '',
} = {}) {
  if (!db) throw new Error('Supabase connection is not configured.');
  signal?.throwIfAborted();
  if (maxPrice < 0) return [];
  let query = db.from('card_versions').select(`${PLAYER_CARD_SELECT},
      slot_positions:card_positions!inner(positions!inner(name))
    `, { count: 'exact' }).eq('slot_positions.positions.name', normalizeChemistryPosition(position))
    .gte('overall', minOverall);
  if (maxOverallExclusive != null) query = query.lt('overall', maxOverallExclusive);
  // Preserve the existing convention that a missing price costs zero.
  if (Number.isFinite(maxPrice)) query = query.or(`price.lte.${maxPrice},price.is.null`);
  if (minPrice !== '' && minPrice != null && Number(minPrice) > 0) query = query.gte('price', Number(minPrice));
  query = query.order('overall', { ascending: false }).order('id');
  if (signal) query = query.abortSignal(signal);
  const { data, error, count } = await query;
  if (error) throw error;
  signal?.throwIfAborted();
  // Never silently lose manager-compatible candidates at the server row cap.
  if (count != null && count > (data?.length ?? 0)) {
    throw new Error('Alternative candidates exceed the API row limit. Narrow the price filters and retry.');
  }
  return data ?? [];
}

export async function loadAlternativePlayers(db, options, normalizeCard, signal) {
  signal?.throwIfAborted();
  const prepared = prepareSwap(options);
  if (!prepared) return [];
  const fixed = Object.fromEntries(Object.entries(options.squad).filter(([position]) => position !== options.targetPosition));
  const remaining = options.maxBudget > 0
    ? options.maxBudget - calculateSquadTotalCost(fixed) : Infinity;
  const maxPrice = Math.min(remaining, options.maxPrice !== '' && options.maxPrice != null
    ? Number(options.maxPrice) : Infinity);
  const queryOptions = { maxPrice, minPrice: options.minPrice };
  const qualified = [];
  // Reuse the same fixed-squad deltas and manager search for both candidate bands.
  const evaluateBatch = async rows => {
    let lastYield = performance.now();
    for (const raw of rows) {
      signal?.throwIfAborted();
      const card = normalizeCard(raw);
      const candidate = card && prepared.eligible(card);
      const row = candidate && prepared.evaluate(candidate);
      if (row) qualified.push(row);
      if (performance.now() - lastYield >= 8) {
        await new Promise(resolve => setTimeout(resolve, 0));
        lastYield = performance.now();
      }
    }
    signal?.throwIfAborted();
  };
  const high = await fetchAlternativeCards(db, options.targetPosition, signal, queryOptions);
  await evaluateBatch(high);
  if (qualified.length <= 2) {
    const lower = await fetchAlternativeCards(db, options.targetPosition, signal, {
      ...queryOptions, minOverall: 75, maxOverallExclusive: 80,
    });
    await evaluateBatch(lower);
  }
  return rankAlternatives(qualified, options.targetPosition);
}

