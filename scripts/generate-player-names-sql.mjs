import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';

// Local file generation only. No database client, credentials or network access.
export function sqlString(value) {
  if (value == null || /^(?:null|nan)?$/i.test(value.trim())) return 'NULL';
  if (value.includes('\0')) throw new Error('PostgreSQL text cannot contain a NUL character');
  return `'${value.replaceAll("'", "''")}'`;
}

export function generateSql(csv) {
  const rows = parse(csv, {
    bom: true, columns: true, skip_empty_lines: true,
    relax_column_count_less: true,
  });
  const statements = ['BEGIN;', 'SET LOCAL standard_conforming_strings = on;'];
  let skipped = 0;
  for (const row of rows) {
    const id = row.player_id?.trim();
    if (!id || /^(?:null|nan)$/i.test(id)) {
      skipped += 1;
      continue;
    }
    // Never interpolate arbitrary CSV content as SQL, or round IDs via Number.
    if (!/^\d+$/.test(id) || BigInt(id) <= 0n) {
      throw new Error(`Invalid player_id: ${JSON.stringify(id)}`);
    }
    statements.push(`UPDATE players SET name = ${sqlString(row.short_name)}, long_name = ${sqlString(row.long_name)} WHERE id = ${BigInt(id)};`);
  }
  statements.push('COMMIT;');
  return { sql: `${statements.join('\n')}\n`, count: rows.length - skipped, skipped };
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const input = resolve(process.argv[2] ?? resolve(root, 'fc26_dataset.csv'));
  const output = resolve(process.argv[3] ?? resolve(root, 'update_players.sql'));
  if (input === output) throw new Error('Input and output must be different files');
  const { sql, count, skipped } = generateSql(await readFile(input, 'utf8'));
  await writeFile(output, sql, 'utf8');
  console.log(JSON.stringify({ output, updates: count, skipped }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
