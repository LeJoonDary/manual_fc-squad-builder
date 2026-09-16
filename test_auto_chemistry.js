// Run with Node.js 22.18+ (native TypeScript support): node test_auto_chemistry.js
import assert from 'node:assert/strict';
import { calculateChemistry } from './utils/chemistry.ts';
import { findBestManager } from './utils/autoBuildUtils.ts';

const players = [
  { id: '1', name: '선수 A', position: 'ST', leagueId: 'A', nationId: 'A', clubId: 'club-1' },
  { id: '2', name: '선수 B', position: 'CM', leagueId: 'A', nationId: 'B', clubId: 'club-2' },
  { id: '3', name: '선수 C', position: 'CB', leagueId: 'B', nationId: 'A', clubId: 'club-3' },
  { id: '4', name: '선수 D', position: 'GK', leagueId: 'C', nationId: 'C', clubId: 'club-4' },
];

const current = calculateChemistry(players.map(player => ({ position: player.position, player }))).totalChemistry;
const result = findBestManager(players);
assert.equal(current, 2);
assert.deepEqual(result, { bestLeagueId: 'A', bestNationId: 'B', maxChemistry: 5, addedChemistry: 3 });

console.log('\n⚽ Smart Manager 시뮬레이션');
console.log('────────────────────────────────────────────────────');
console.log(`현재 케미스트리 ${current}점 -> 감독(${result.bestLeagueId}리그, ${result.bestNationId}국적) 투입 시 ${result.maxChemistry}점으로 가장 높게 상승!`);
console.log(`✅ 케미스트리 +${result.addedChemistry}점 · 예상 결과 검증 완료\n`);
