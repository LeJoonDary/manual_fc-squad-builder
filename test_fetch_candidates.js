// Node.js 22.18+: node test_fetch_candidates.js
import assert from 'node:assert/strict';
import { fetchCandidatePlayers, getCandidateBudgetPlan } from './utils/autoBuildUtils.ts';
import { createCandidateMockDb, mockCandidate } from './scripts/mocks/candidateDb.js';

const rows = ['ST', 'LW', 'RW', 'CAM', 'CM', 'CDM', 'LM', 'RM', 'CB', 'LB', 'RB', 'GK']
  .flatMap((position, groupIndex) => Array.from({ length: 14 }, (_, i) =>
    mockCandidate(groupIndex * 100 + i, [position], 20000 + i * 30000, 75 + i)));
const supabase = createCandidateMockDb(rows);
// Real DB: replace the stub above with createClient(url, key) from @supabase/supabase-js.
// Load VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your environment/.env.local.
// Use your existing read access/RLS policy; no service-role key is needed in this script.
const totalBudget = 1000000;
const budgetRatios = { FW: 40, MF: 35, DF: 25 };
const formation = '4-3-3';
const isThreeBack = false;
const candidates = await fetchCandidatePlayers(totalBudget, budgetRatios, formation, isThreeBack, supabase);
const format = value => Math.round(value).toLocaleString('en-US');
console.log(`\n⚽ 후보군 필터링 · Mock DB · ${formation} · 총예산 ${format(totalBudget)} C`);
console.table(getCandidateBudgetPlan(totalBudget, budgetRatios, formation, isThreeBack).map(item => {
  const selected = candidates.filter(card => card.candidateGroups.includes(item.group));
  const prices = selected.map(card => card.price);
  assert.ok(selected.length <= item.limit);
  assert.ok(prices.every(price => price >= 0 && price <= item.priceCap));
  return { 그룹: item.group, 자리수: item.slotCount, 그룹예산: format(item.targetBudget),
    '1인평균': format(item.averageBudget), 가격상한: format(item.priceCap), 후보수: selected.length,
    가격대: prices.length ? `${format(Math.min(...prices))} ~ ${format(Math.max(...prices))} C` : '후보 없음' };
}));
console.log(`✅ 중복 제거 후 ${candidates.length}명 · 가격 상한과 조회 제한 검증 완료\n`);
