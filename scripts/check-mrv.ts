import 'dotenv/config';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { fetchCandidatePlayers, generateOptimalSquad } from '../utils/autoBuildUtils';

const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data: styles, error } = await db.from('playstyles').select('id,name').ilike('name', '%Pinged Pass%');
if (error) throw new Error(error.message);
assert.ok(styles?.length);
const options = { maxIcons: 0, maxHeroes: 0, currentSquad: [],
  slotRequirements: Object.fromEntries(['LCM', 'CM', 'RCM'].map(position => [position,
    { playstyles: [{ id: styles[0].id, name: styles[0].name, isPlus: true }] }])) };
const candidates = await fetchCandidatePlayers(1000000, '4-3-1-2', false, db, options);
const result = await generateOptimalSquad('4-3-1-2', candidates, 1000000, 33, true, options);
console.log(JSON.stringify({ status: result.status, chemistry: result.totalChemistry, cost: result.totalCost,
  iterations: result.iterations, squad: result.squad.map(p => ({ id: p.id, name: p.name, slot: p.slotPosition, price: p.price })) }, null, 2));
assert.equal(result.success, true);
assert.equal(result.totalChemistry, 33);
assert.ok(result.totalCost <= 1000000);
assert.equal(result.squad.filter(p => p.isLocked).length, 0);
