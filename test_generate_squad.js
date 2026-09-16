// Node.js 22.18+: node test_generate_squad.js
import assert from 'node:assert/strict';
import { fetchCandidatePlayers, generateOptimalSquad, groupCandidatePlayers } from './utils/autoBuildUtils.ts';
import { createCandidateMockDb } from './scripts/mocks/candidateDb.js';
import { createSquadCandidateRows } from './scripts/mocks/squadCandidates.js';

const db = createCandidateMockDb(createSquadCandidateRows());
const budget = 1000000;
const candidates = await fetchCandidatePlayers(budget, { FW: 400000, MF: 350000, DF: 250000 }, '4-3-3', false, db);
const started = performance.now();
const result = await generateOptimalSquad('4-3-3', groupCandidatePlayers(candidates), budget, 33, true);
assert.ok(result.success);
assert.equal(result.squad.length, 11);
assert.equal(new Set(result.squad.map(p => p.playerKey)).size, 11);
assert.ok(result.totalCost <= budget);
assert.equal(result.totalChemistry, 33);
assert.ok(result.iterations <= 1500);
console.log('\n⚽ 자동 완성 시뮬레이션 · Mock DB → 후보 필터링 → 스쿼드 탐색');
console.table(result.squad.map(player => ({ 슬롯: player.slotPosition, 선수: player.name,
  가격: player.price.toLocaleString('en-US'), 메타점수: player.metaScore.toFixed(2) })));
console.log(`총비용 ${result.totalCost.toLocaleString('en-US')} / ${budget.toLocaleString('en-US')} C`);
console.log(`케미스트리 ${result.totalChemistry}/33 · 평균 메타 ${result.teamMetaScore.toFixed(2)}`);
console.log('감독:', result.manager);
console.log(`✅ ${result.status} · 탐색 ${result.iterations}/1500회 · ${(performance.now() - started).toFixed(1)}ms\n`);
