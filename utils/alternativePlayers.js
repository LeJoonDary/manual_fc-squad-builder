import { adaptChemistryPlayerCard, calculateChemistry, isPositionMatched, normalizeChemistryPosition } from './chemistry.ts';
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
const swapOrder = (a, b) => getPlayerTier(a.card) - getPlayerTier(b.card) || Number(b.card.overall ?? 0) - Number(a.card.overall ?? 0)
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
      const { result, bestManager } = findSwapManager([...temporary, { position: targetPosition, player }], manager, target);
      if (result.totalChemistry < target) return null;
      return { card, bestManager, isIcon: icon,
        totalChemistry: result.totalChemistry, playerChemistry: result.playerChemMap[player.id] ?? 0 };
    },
  };
}

function applySwapOvrFilter(candidates) {
  const highRated = candidates.filter(({ card }) => Number(card.overall) >= 80);
  return highRated.length >= 5 ? highRated : candidates.filter(({ card }) => Number(card.overall) >= 75);
}

export function suggestAlternativePlayers(options) {
  const prepared = prepareSwap(options);
  if (!prepared) return [];
  const qualified = [];
  const eligible = options.candidates.map(card => prepared.eligible(card)).filter(Boolean);
  for (const candidate of applySwapOvrFilter(eligible)) {
    const row = prepared.evaluate(candidate);
    if (row) qualified.push(row);
  }
  return qualified.sort(swapOrder);
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
  for (const candidate of applySwapOvrFilter(eligible)) {
    const row = prepared.evaluate(candidate);
    if (row) qualified.push(row);
    if (performance.now() - lastYield >= 8) await yieldIfNeeded();
  }
  return qualified.sort(swapOrder);
}
// Fetch all position candidates so the adaptive OVR cutoff uses the complete eligible pool.
export async function fetchAlternativeCards(db, position, signal) {
  if (!db) throw new Error('Supabase connection is not configured.');
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    signal?.throwIfAborted();
    let query = db.from('card_versions').select(`${PLAYER_CARD_SELECT},
      slot_positions:card_positions!inner(positions!inner(name))
    `).eq('slot_positions.positions.name', normalizeChemistryPosition(position))
      .order('id').range(offset, offset + 499);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data?.length || data.length < 500) return rows;
  }
}


