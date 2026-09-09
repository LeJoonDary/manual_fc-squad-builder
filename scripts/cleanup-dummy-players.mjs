import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Preview: node scripts/cleanup-dummy-players.mjs
// Delete:  node scripts/cleanup-dummy-players.mjs --execute
// REST requests commit individually. On failure, stop and report partial counts;
// rerunning is safe. No FK constraints are disabled.
const root = new URL('../', import.meta.url);
dotenv.config({ path: [fileURLToPath(new URL('.env.local', root)), fileURLToPath(new URL('.env', root))], quiet: true });
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Supabase URL and service role key are required.');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const names = ['David Beckham', 'Zinedine Zidane', 'Peter Crouch', 'Fernando Morientes'];
const nameFilter = ['name', 'long_name'].flatMap(column => names.map(name => `${column}.eq.${name}`)).join(',');
const children = ['card_positions', 'card_playstyles', 'card_roles', 'player_stats'];
const execute = process.argv.includes('--execute');
const report = { executed: execute, startedAt: new Date().toISOString(), planned: {}, deleted: {}, verified: false };
const batches = ids => Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100));
async function read(table, filter, columns = '*') {
  const rows = [];
  for (let offset = 0; ; ) {
    const { data, error } = await filter(db.from(table).select(columns)).order('id').range(offset, offset + 499);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data.length) return rows;
    rows.push(...data);
    offset += data.length;
  }
}
async function byIds(table, column, ids, columns = '*') {
  const rows = [];
  for (const batch of batches(ids)) rows.push(...await read(table, q => q.in(column, batch), columns));
  return rows;
}
async function count(table, column, ids) {
  let total = 0;
  for (const batch of batches(ids)) {
    const result = await db.from(table).select('id', { count: 'exact', head: true }).in(column, batch);
    if (result.error || result.count === null) throw new Error(`${table}: ${result.error?.message ?? 'count unavailable'}`);
    total += result.count;
  }
  return total;
}
try {
  const named = await read('players', q => q.or(nameFilter), 'id,name,long_name');
  const chem = await read('card_versions', q => q.eq('version', 'CHEM TEST'), 'id,player_id,version');
  const namedCards = await byIds('card_versions', 'player_id', named.map(p => p.id), 'id,player_id,version');
  const cards = [...new Map([...chem, ...namedCards].map(c => [String(c.id), c])).values()];
  const cardIds = cards.map(c => c.id);
  const candidateIds = [...new Set([...named.map(p => p.id), ...chem.map(c => c.player_id)])];
  const allCards = await byIds('card_versions', 'player_id', candidateIds, 'id,player_id');
  const targetSet = new Set(cardIds.map(String));
  // Keep other players if they still have a non-test card.
  const retainedPlayers = new Set(allCards.filter(c => !targetSet.has(String(c.id))).map(c => String(c.player_id)));
  const playerIds = candidateIds.filter(id => !retainedPlayers.has(String(id)));
  const players = await byIds('players', 'id', playerIds, 'id,name,long_name');
  report.players = players;
  report.cards = cards;
  for (const table of children) report.planned[table] = await count(table, 'card_id', cardIds);
  report.planned.card_versions = cardIds.length;
  report.planned.players = players.length;
  console.log('삭제 대상 선수:', JSON.stringify(players));
  console.table(report.planned);
  if (execute) {
    for (const table of [...children, 'card_versions', 'players']) {
      const column = children.includes(table) ? 'card_id' : 'id';
      const ids = table === 'players' ? playerIds : cardIds;
      report.deleted[table] = 0;
      for (const batch of batches(ids)) {
        const result = await db.from(table).delete({ count: 'exact' }).in(column, batch);
        if (result.error || result.count === null) throw new Error(`${table}: ${result.error?.message ?? 'delete count unavailable'}`);
        report.deleted[table] += result.count;
      }
      if (await count(table, column, ids)) throw new Error(`${table}: target rows remain`);
    }
    const remainingNames = await read('players', q => q.or(nameFilter), 'id');
    const remainingChem = await read('card_versions', q => q.eq('version', 'CHEM TEST'), 'id');
    for (const table of children) {
      if (await count(table, 'card_id', cardIds)) throw new Error(`${table}: related rows remain`);
    }
    if (remainingNames.length || remainingChem.length) throw new Error('Matching players or CHEM TEST cards remain');
    report.verified = true;
    report.totalDeleted = Object.values(report.deleted).reduce((a, b) => a + b, 0);
    console.table(report.deleted);
    console.log(`총 ${report.totalDeleted}행 삭제 완료. 대상 선수, CHEM TEST 카드 및 연관 행 잔여 0건 검증 완료.`);
  }
} catch (error) {
  report.error = error.message;
  console.error('Cleanup failed:', error.message, 'Completed deletes:', report.deleted);
  process.exitCode = 1;
} finally {
  if (execute) writeFileSync(new URL(`cleanup-dummy-players-${Date.now()}.json`, root), JSON.stringify(report, null, 2));
}
