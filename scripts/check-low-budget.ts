import 'dotenv/config';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { AUTO_BUILD_CANDIDATE_SELECT, fetchCandidatePlayers, generateOptimalSquad } from '../utils/autoBuildUtils';
const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
for (const budget of [100000, 1000000]) {
  const options = { excludeZeroPriceCards: true };
  const pool = await fetchCandidatePlayers(budget, '4-3-1-2', false, db, options);
  const start = performance.now();
  const result = await generateOptimalSquad('4-3-1-2', pool, budget, 33, true, options);
  const elapsedMs = performance.now() - start;
  console.log({ budget, candidates: pool.length, elapsedMs, chemistry: result.totalChemistry,
    stage: result.searchStage, iterations: result.iterations, cost: result.totalCost,
    squad: result.squad.map(p => ({ slot: p.slotPosition, name:p.name, price:p.price })), manager: result.manager });
  assert.ok(result.success && result.totalChemistry === 33 && result.totalCost <= budget);
  if (budget === 100000) assert.ok(elapsedMs < 3000);
}

const lockIds = [26, 22, 15, 88, 231, 19870, 31];
const slots = [0, 1, 2, 4, 6, 7, 10];
const { data, error } = await db.from('card_versions').select(AUTO_BUILD_CANDIDATE_SELECT).in('id', lockIds);
if (error) throw error;
const options = { currentSquad: Object.fromEntries(lockIds.map((id, i) => {
  const card = data.find(c => Number(c.id) === id);
  assert.ok(card, `Missing locked card ${id}`);
  return [slots[i], { card, isLocked: true, isOwned: true }];
})) };
const pool = await fetchCandidatePlayers(100000, '4-3-1-2', false, db, options);
const start = performance.now();
const result = await generateOptimalSquad('4-3-1-2', pool, 100000, 33, true, options);
const open = Object.fromEntries(result.squad.filter(p => !p.isLocked).map(p => [p.slotPosition, p.name]));
console.log({ elapsedMs: performance.now() - start, candidates: pool.length, open,
  cost: result.totalCost, chemistry: result.totalChemistry, manager: result.manager });
assert.ok(result.success && result.totalChemistry === 33 && result.totalCost <= 100000);
assert.deepEqual(open, { LCM: 'Mariona', RCM: 'R. De Paul', RCB: 'W. Saliba', RB: 'J. Frimpong' });
assert.equal(result.manager?.bestLeagueId, 'league:id:7');
assert.equal(result.manager?.bestNationId, 'nation:id:11');

const { data: valencia, error: valenciaError } = await db.from('card_versions')
  .select(AUTO_BUILD_CANDIDATE_SELECT).eq('id', 20014).single();
if (valenciaError) throw valenciaError;
const eightOptions = { currentSquad: { ...options.currentSquad,
  9: { card: valencia, isLocked: true, isOwned: true } } };
const eightPool = await fetchCandidatePlayers(100000, '4-3-1-2', false, db, eightOptions);
const eightStart = performance.now();
const eight = await generateOptimalSquad('4-3-1-2', eightPool, 100000, 33, true, eightOptions);
console.log({ locks: 8, elapsedMs: performance.now() - eightStart, chemistry: eight.totalChemistry,
  open: eight.squad.filter(p => !p.isLocked).map(p => p.name), cost: eight.totalCost, manager: eight.manager });
assert.ok(eight.success && eight.totalChemistry === 33 && eight.totalCost <= 100000);

