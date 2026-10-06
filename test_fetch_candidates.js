// Node.js 22.18+: node test_fetch_candidates.js
import assert from 'node:assert/strict';
import { fetchCandidatePlayers, getMaxSlotPrice } from './utils/autoBuildUtils.ts';
import { createCandidateMockDb, mockCandidate } from './scripts/mocks/candidateDb.js';

const rows = ['ST', 'LW', 'RW', 'CAM', 'CM', 'CDM', 'LM', 'RM', 'CB', 'LB', 'RB', 'GK']
  .flatMap((position, groupIndex) => Array.from({ length: 14 }, (_, i) =>
    mockCandidate(groupIndex * 100 + i, [position], 20000 + i * 30000, 75 + i)));
const supabase = createCandidateMockDb(rows);
// Real DB: replace the stub above with createClient(url, key) from @supabase/supabase-js.
// Load VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your environment/.env.local.
// Use your existing read access/RLS policy; no service-role key is needed in this script.
const totalBudget = 1000000;
const formation = '4-3-3';
const isThreeBack = false;
const candidates = await fetchCandidatePlayers(totalBudget, formation, isThreeBack, supabase);
const format = value => Math.round(value).toLocaleString('en-US');
console.log(`\n⚽ 후보군 필터링 · Mock DB · ${formation} · 총예산 ${format(totalBudget)} C`);
assert.ok(supabase.calls.every(call => call.limit === 120 && call.max === getMaxSlotPrice(call.positions[0], 'attack', totalBudget, totalBudget)));
assert.ok(candidates.every(card => card.price <= totalBudget));
console.log(`✅ 중복 제거 후 ${candidates.length}명 · 가격과 조회 제한 검증 완료\n`);
