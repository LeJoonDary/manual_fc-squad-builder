// Read-only: verifies club labels and ID-based catalog/modal queries against Supabase.
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { fetchAffiliations, clubDisplayInfo } from '../utils/affiliations.js';
import { fetchModalPlayerPage } from '../utils/modalPlayers.js';
import { buildPlayerQuery, createDefaultFilters } from '../utils/playerFilters.js';
import { getRecommendedPlayersForEmptySlot } from '../utils/autoBuildUtils.ts';
import { matchesAffiliation } from '../utils/affiliationFilters.js';
dotenv.config({ path: ['.env.local', '.env'], quiet: true });
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const catalog = await fetchAffiliations(db);
const selected = [];
for (const name of ['Real Madrid', 'FC Barcelona', 'Manchester City', 'Arsenal']) {
  const clubs = catalog.clubs.filter(club => club.name.toLowerCase() === name.toLowerCase());
  assert(clubs.length >= 2, `Expected men's and women's clubs for ${name}`);
  assert(clubs.some(club => clubDisplayInfo(club).women) && clubs.some(club => !clubDisplayInfo(club).women));
  for (const club of clubs) {
    const { data, error } = await buildPlayerQuery(db, { ...createDefaultFilters(), club: String(club.id) }).limit(3);
    if (error) throw new Error(error.message);
    assert(data.every(card => String(card.club_id) === String(club.id)));
    console.log(JSON.stringify({ name: club.name, clubId: club.id, ...clubDisplayInfo(club), playerCards: data.length }));
  }
  if (name === 'Real Madrid') selected.push(...clubs);
}
selected.push(...catalog.clubs.filter(club => club.name === 'Chelsea' && !clubDisplayInfo(club).women));
for (const affiliation of [{ leagueId: '2' }, ...selected.map(club => ({ clubId: String(club.id) }))]) {
  const options = { formation: '4-3-1-2', slotPosition: 'LS', totalBudget: 0, currentSquad: {}, sort: 'all_meta', affiliation };
  const rows = await getRecommendedPlayersForEmptySlot(db, options);
  if (!affiliation.clubId || affiliation.clubId === '2') assert(rows.length > 0, 'Expected matching striker recommendations');
  assert(rows.every(row => matchesAffiliation(row.card, affiliation)));
  if (affiliation.clubId === '32') {
    const { data, error } = await db.from('card_versions').select('id,price,card_type,slot:card_positions!inner(positions!inner(name))').eq('club_id', 32).eq('slot.positions.name', 'ST');
    if (error) throw error;
    assert.deepEqual(rows.map(row => String(row.card.id)).sort(), data.map(card => String(card.id)).sort());
    assert(rows.every((row, index) => !index || rows[index - 1].meta >= row.meta));
    console.log(JSON.stringify({ chelseaAllDatabaseCardsMatched: data.length, types: [...new Set(data.map(card => card.card_type))], zeroPriceCards: data.filter(card => Number(card.price) === 0).length }));
  }
  if (!rows.length) {
    const search = await fetchModalPlayerPage(db, { position: 'ST', affiliation });
    assert(search.every(card => matchesAffiliation(card, affiliation)));
    console.log(JSON.stringify({ affiliation, unlockedStrikerRecommendations: 0, matchingStrikerSearchResults: search.length }));
    continue;
  }
  const player = rows[0].card.players;
  const name = (Array.isArray(player) ? player[0] : player).name;
  const maxPrice = Number(rows[0].card.price);
  const search = await fetchModalPlayerPage(db, { position: 'ST', keyword: name, maxPrice, affiliation });
  assert(search.length > 0);
  assert(search.every(card => matchesAffiliation(card, affiliation) && card.price <= maxPrice));
  console.log(JSON.stringify({ affiliation, unlockedStrikerRecommendations: rows.length, matchingNameAndPriceResults: search.length }));
}
