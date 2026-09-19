import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Use the linked project's IPv4-compatible pooler without exposing credentials.
const direct = new URL(process.env.DATABASE_URL);
const pooler = new URL(readFileSync(new URL('../supabase/.temp/pooler-url', import.meta.url), 'utf8').trim());
pooler.password = direct.password;
pooler.searchParams.set('sslmode', 'require');
const result = spawnSync(process.execPath, [
  'node_modules/prisma/build/index.js', 'db', 'execute',
  '--file', 'supabase/migrations/202609190001_player_filter_query.sql', '--schema', 'prisma/schema.prisma',
], { env: { ...process.env, DATABASE_URL: pooler.href }, stdio: 'inherit' });
process.exit(result.status ?? 1);
