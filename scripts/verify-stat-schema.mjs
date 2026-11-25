// Read-only verification using the same queries and engine as the UI.
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { STAT_KEYS, matchesDetailedStats } from '../utils/statFilters.js';
import { createDefaultFilters, fetchPlayersPage } from '../utils/playerFilters.js';
import { fetchCandidatePlayers, getRecommendedPlayersForEmptySlot, generateOptimalSquad } from '../utils/autoBuildUtils.ts';
dotenv.config({ path: ['.env.local', '.env'], quiet: true });
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const { error } = await db.from('player_stats').select(STAT_KEYS.join(',')).limit(1);
if (error) throw new Error(`40-column schema check: ${error.message}`);
console.log('All 40 player_stats columns accepted by Supabase.');
for (const [key, min] of [['pac', 80], ['dribbling', 85]]) {
  const detailedStats = { [key]: { min } };
  const options = { formation: '4-4-2', slotPosition: 'LS', totalBudget: 1000000, sort: 'all_meta',
    currentSquad: {}, slotRequirements: { LS: { detailedStats } }, excludeZeroPriceCards: true };
  const recommendations = await getRecommendedPlayersForEmptySlot(db, options);
  assert(recommendations.every(row => matchesDetailedStats(row.card, detailedStats)));
  const filters = createDefaultFilters(); filters.stats[key] = { min, max: '' };
  const page = await fetchPlayersPage(db, filters);
  const candidates = await fetchCandidatePlayers(1000000, '4-4-2', false, db, options);
  const result = await generateOptimalSquad('4-4-2', candidates, 1000000, 0, false, options);
  const striker = result.squad.find(player => player.slotPosition === 'LS');
  assert(result.success && striker, 'Auto-build did not produce a complete squad.');
  assert(matchesDetailedStats(striker, detailedStats), 'LS failed its stat requirement.');
  console.log(JSON.stringify({ condition: `${key} >= ${min}`, recommendations: recommendations.length,
    playerResults: page.total, autoBuildSuccess: result.success, squadSize: result.squad.length, lsMatches: true }));
}
