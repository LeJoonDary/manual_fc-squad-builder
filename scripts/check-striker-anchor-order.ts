import 'dotenv/config';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { AUTO_BUILD_CANDIDATE_SELECT, fetchCandidatePlayers, generateOptimalSquad } from '../utils/autoBuildUtils';

const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
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

// Explicit owned card versions keep the three-lock regression reproducible.
const threeIds = [19980, 396, 20264];
const { data: threeCards, error: threeError } = await db.from('card_versions')
  .select(AUTO_BUILD_CANDIDATE_SELECT).in('id', threeIds);
if (threeError) throw threeError;
const threeOptions = { maxIcons: 0, maxHeroes: 0, currentSquad: Object.fromEntries(threeIds.map((id, i) => {
  const card = threeCards.find(c => Number(c.id) === id);
  assert.ok(card);
  return [[1, 7, 6][i], { card, isLocked: true, isOwned: true }];
})) };
const threePool = await fetchCandidatePlayers(300000, '4-3-1-2', false, db, threeOptions);

let currentSquad = threeOptions.currentSquad;
let firstSquad: string[] | undefined;
for (let run = 1; run <= 5; run++) {
  const started = performance.now();
  const result = await generateOptimalSquad('4-3-1-2', threePool, 300000, 33, true, { ...threeOptions, currentSquad });
  console.log({ run, elapsedMs: performance.now() - started, chemistry: result.totalChemistry,
    cost: result.totalCost, squad: result.squad.map(p => ({ slot: p.slotPosition, name: p.name, id: p.id, price: p.price })) });
  assert.ok(result.success && result.totalChemistry === 33 && result.totalCost <= 300000);
  assert.equal(result.squad.find(p => p.slotPosition === 'LS')?.name, 'Ewa Pajor');
  assert.ok(result.squad.filter(p => !p.isLocked && !['LS', 'RS'].includes(p.slotPosition)).every(p => p.price <= 90000));
  const ids = result.squad.map(p => p.id);
  if (firstSquad) assert.deepEqual(ids, firstSquad);
  firstSquad = ids;
  currentSquad = Object.fromEntries(result.squad.map((p, i) => [i, { card: p.card, isLocked: p.isLocked, isOwned: p.isOwned }]));
}

for (const [excludedCardVersionIds, expected] of [[['22'], 'Kika Nazareth'], [['22', '294'], 'Anthony Gordon']] as const) {
  const result = await generateOptimalSquad('4-3-1-2', threePool, 300000, 33, true,
    { ...threeOptions, currentSquad, excludedCardVersionIds: [...excludedCardVersionIds] });
  console.log({ excludedCardVersionIds, striker: result.squad.find(p => p.slotPosition === 'LS')?.name,
    chemistry: result.totalChemistry, cost: result.totalCost });
  assert.ok(result.success && result.totalChemistry === 33);
  assert.equal(result.squad.find(p => p.slotPosition === 'LS')?.name, expected);
}
