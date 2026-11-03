import 'dotenv/config';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { AUTO_BUILD_CANDIDATE_SELECT, fetchCandidatePlayers, groupCandidatePlayers, generateOptimalSquad } from '../utils/autoBuildUtils';
import { calculateChemistry } from '../utils/chemistry';

const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!);
const names = ['Adeyemi', 'Yamal', 'Bonmat', 'Stanway', 'Espart', 'Richards', 'Batlle', 'Pajor', 'Mariona', 'Saliba', 'Raya'];
const rows = await Promise.all(names.map(async name => {
  const { data, error } = await db.from('card_versions').select(AUTO_BUILD_CANDIDATE_SELECT)
    .or(`long_name.ilike.%${name}%,name.ilike.%${name}%`, { referencedTable: 'players' }).order('overall', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}));
const ids = ['19980', '14', '8', '88', '20264', '19988', '65'];
const indices = [0, 2, 3, 5, 9, 7, 6];
const currentSquad = Object.fromEntries(ids.map((id, i) => {
  const card = rows[i].find(c => String(c.id) === id);
  assert.ok(card, `Missing lock ${names[i]} ${id}`);
  return [indices[i], { card, isLocked: true, isOwned: true }];
}));
const options = { currentSquad, maxIcons: 0, maxHeroes: 0 };
const target = [rows[7].find(c => String(c.id) === '22'),
  rows[8].find(c => c.overall === 89 && Number(c.price) > 0) ?? rows[8].find(c => Number(c.price) > 0),
  rows[9].find(c => String(c.id) === '38'), rows[10].find(c => String(c.id) === '31')];
assert.ok(target.every(Boolean), 'Missing target cards');
for (const [label, candidates] of [
  ['requested four candidates', target.map(card => ({ ...card, candidateGroups: ['FW', 'MF', 'DF'] }))],
  ['full market pool', await fetchCandidatePlayers(500000, '4-3-3 (2)', false, db, options)],
] as const) {
  const result = await generateOptimalSquad('4-3-3 (2)', groupCandidatePlayers(candidates as any), 500000, 33, true, options);
  console.log(JSON.stringify({ label, status: result.status, chemistry: result.totalChemistry, cost: result.totalCost,
    manager: result.manager, squad: result.squad.map(p => ({ name: p.name, id: p.id, slot: p.slotPosition, locked: p.isLocked })) }, null, 2));
  assert.equal(result.success, true);
  assert.equal(result.totalChemistry, 33);
  assert.ok(result.totalCost <= 500000);
  assert.equal(result.squad.filter(p => p.isLocked).length, 7);
  if (label === 'requested four candidates') {
    assert.equal(calculateChemistry(result.squad.map(player => ({ position: player.slotPosition, player })),
      { leagueId: 'league:id:3', nationId: 'nation:id:11' }).totalChemistry, 33);
  }
}
