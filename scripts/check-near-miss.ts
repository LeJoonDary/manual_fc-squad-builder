import 'dotenv/config';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { AUTO_BUILD_CANDIDATE_SELECT, fetchCandidatePlayers, groupCandidatePlayers, generateOptimalSquad } from '../utils/autoBuildUtils';

const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!);
const locks = [];
for (const [name, overall, slot] of [['Pajor', 89, 0], ['Cunha', 87, 1], ['Bonmat', 90, 4]] as const) {
  const { data, error } = await db.from('card_versions').select(AUTO_BUILD_CANDIDATE_SELECT)
    .eq('overall', overall).ilike('players.long_name', `%${name}%`).order('price').limit(10);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(`Missing ${name} (${overall})`);
  locks.push([slot, { card: data[0], isLocked: true, isOwned: true }]);
}
const options = { currentSquad: Object.fromEntries(locks) };
const candidates = await fetchCandidatePlayers(1000000, '4-3-1-2', false, db, options);
const result = await generateOptimalSquad('4-3-1-2', groupCandidatePlayers(candidates), 1000000, 33, true, options);
console.log(JSON.stringify({ formation: '4-3-1-2', ownedLocks: true, considerManager: true,
  status: result.status, chemistry: result.totalChemistry, cost: result.totalCost,
  squad: result.squad.map(p => ({ name: p.name, slot: p.slotPosition, id: p.id, locked: p.isLocked })) }, null, 2));
assert.equal(result.success, true);
assert.equal(result.totalChemistry, 33);
assert.ok(result.totalCost <= 1000000);
assert.equal(new Set(result.squad.map(p => p.playerKey)).size, 11);
assert.equal(result.squad.filter(p => p.isLocked).length, 3);
for (const [index, entry] of Object.entries(options.currentSquad)) {
  assert.equal(result.squad[Number(index)].id, String(entry.card.id));
}
