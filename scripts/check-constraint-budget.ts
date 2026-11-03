import 'dotenv/config';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { fetchCandidatePlayers, generateOptimalSquad, withinConstraintBudget } from '../utils/autoBuildUtils';

const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!);
for (const [style, positions, isPlus] of [['Gamechanger', ['LS'], false], ['Pinged Pass', ['LCM', 'CM', 'RCM'], true]] as const) {
  const { data, error } = await db.from('playstyles').select('id,name').eq('name', style);
  if (error) throw new Error(error.message);
  assert.ok(data?.length);
  const options = { maxIcons: 0, maxHeroes: 0, currentSquad: [], slotRequirements:
    Object.fromEntries(positions.map(p => [p, { playstyles: [{ ...data[0], isPlus }] }])) };
  const candidates = await fetchCandidatePlayers(1000000, '4-3-1-2', false, db, options);
  const result = await generateOptimalSquad('4-3-1-2', candidates, 1000000, 33, true, options);
  console.log(JSON.stringify({ style, status: result.status, chemistry: result.totalChemistry, cost: result.totalCost,
    constrained: result.squad.filter(p => positions.includes(p.slotPosition as never)).map(p => ({ name: p.name, price: p.price })),
    expensiveCandidates: candidates.filter(p => Number(p.price) > 800000).map(p => ({ id: p.id, price: p.price })) }, null, 2));
  assert.ok(result.success);
  assert.ok(withinConstraintBudget(result.squad, 1000000, options));
  assert.ok(result.totalCost <= 1000000);
}
