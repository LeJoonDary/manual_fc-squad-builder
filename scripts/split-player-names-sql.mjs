import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_LINES = 5000;
const SETTING = 'SET LOCAL standard_conforming_strings = on;';

// This splitter accepts the one-UPDATE-per-line format of our SQL generator.
// Reject other layouts rather than split a statement across transactions.
export function splitSql(text) {
  const lines = text.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (lines.shift() !== 'BEGIN;' || lines.pop() !== 'COMMIT;') {
    throw new Error('Expected BEGIN and COMMIT around the source SQL');
  }
  if (lines[0] === SETTING) lines.shift();
  if (lines.some(line => !/^UPDATE players SET name = .+, long_name = .+ WHERE id = \d+;$/.test(line))) {
    throw new Error('Expected one complete player UPDATE per line');
  }
  const chunks = [];
  // Reserve three lines for BEGIN, the local string setting, and COMMIT.
  for (let offset = 0; offset < lines.length; offset += MAX_LINES - 3) {
    chunks.push(['BEGIN;', SETTING, ...lines.slice(offset, offset + MAX_LINES - 3), 'COMMIT;'].join('\n') + '\n');
  }
  return chunks;
}

async function main() {
  const input = resolve(process.argv[2] ?? fileURLToPath(new URL('../update_players.sql', import.meta.url)));
  const chunks = splitSql(await readFile(input, 'utf8'));
  for (const [index, chunk] of chunks.entries()) {
    const output = join(dirname(input), `update_players_${index + 1}.sql`);
    await writeFile(output, chunk, { encoding: 'utf8', flag: 'wx' });
    console.log(`${output}: ${chunk.trimEnd().split('\n').length} lines`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
