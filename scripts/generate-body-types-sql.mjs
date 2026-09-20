import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { sqlString } from './generate-player-names-sql.mjs';

export const BODY_TYPES = new Map([
  ['Lean (170-185)', 'Lean Medium'], ['Normal (170-185)', 'Average Medium'],
  ['Stocky (170-185)', 'Stocky Medium'], ['Lean (185+)', 'Lean Tall'],
  ['Normal (185+)', 'Average Tall'], ['Stocky (185+)', 'Stocky Tall'],
  ['Lean (170-)', 'Lean Short'], ['Normal (170-)', 'Average Short'],
  ['Stocky (170-)', 'Stocky Short'], ['Unique', 'Unique'],
]);

export function buildUpdates(csv) {
  const rows = parse(csv, { bom: true, columns: true, skip_empty_lines: true });
  const statements = [];
  const unmapped = new Map();
  let skipped = 0;
  for (const row of rows) {
    const id = row.player_id?.trim();
    if (!id || /^(null|nan)$/i.test(id)) { skipped++; continue; }
    if (!/^\d+$/.test(id) || BigInt(id) <= 0n) throw new Error(`Invalid player_id: ${JSON.stringify(id)}`);
    if (!Object.hasOwn(row, 'body_type')) throw new Error('CSV is missing body_type');
    const raw = row.body_type;
    const mapped = BODY_TYPES.get(raw) ?? raw;
    if (!BODY_TYPES.has(raw)) unmapped.set(raw, (unmapped.get(raw) ?? 0) + 1);
    // CSV player_id refers to players.id, not the independent card_versions.id.
    // This patches every existing card of that player and never inserts a row.
    statements.push(`UPDATE card_versions SET body_type = ${sqlString(mapped)} WHERE player_id = ${BigInt(id)};`);
  }
  return { statements, skipped, unmapped: Object.fromEntries(unmapped) };
}

export function transaction(statements) {
  return ['BEGIN;', 'SET LOCAL standard_conforming_strings = on;', ...statements, 'COMMIT;', ''].join('\n');
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { statements, skipped, unmapped } = buildUpdates(await readFile(resolve(root, 'fc26_dataset.csv'), 'utf8'));
  await writeFile(resolve(root, 'update_body_types.sql'), transaction(statements), 'utf8');
  const parts = [];
  if (statements.length + 3 > 5000) {
    for (let start = 0; start < statements.length; start += 4997) {
      const name = `update_body_types_${parts.length + 1}.sql`;
      const batch = statements.slice(start, start + 4997);
      await writeFile(resolve(root, name), transaction(batch), 'utf8');
      parts.push({ name, lines: batch.length + 3 });
    }
  }
  console.log(JSON.stringify({ updates: statements.length, skipped, unmapped, parts }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
