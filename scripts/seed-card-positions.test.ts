import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buildPositions } from './seed-card-positions.ts';

const positions = [{ id: 1, name: 'CAM' }, { id: 2, name: 'CM' }, { id: 3, name: 'CDM' }];
const cards = [{ id: 90, player_id: 252371, version: 'Gold' }, { id: 91, player_id: 252371, version: 'Silver' }];

test('헤더 없는 CSV 첫 행, 쉼표, 순서 및 Gold 버전 매핑', () => {
  assert.deepEqual(buildPositions('252371,"CAM, CM"', positions, cards).records, [
    { card_id: 90, position_id: 1, is_primary: true },
    { card_id: 90, position_id: 2, is_primary: false },
  ]);
});
test('BOM/헤더, 여러 구분자와 동일 중복을 처리', () => {
  const result = buildPositions('\uFEFFplayer_id,player_positions\n252371,cam;CM|CDM/CM\n252371,cam;CM|CDM/CM', positions, cards);
  assert.equal(result.cardCount, 1);
  assert.equal(result.records.length, 3);
  assert.equal(result.records.filter(row => row.is_primary).length, 1);
});
test('누락 매핑과 상충하는 중복은 적재 전에 거부', () => {
  assert.throws(() => buildPositions('252371,ST', positions, cards), /포지션 매핑 실패/);
  assert.throws(() => buildPositions('1,CM', positions, cards), /Gold 카드 매핑 실패/);
  assert.throws(() => buildPositions('252371,CM\n252371,CAM', positions, cards), /상충/);
  assert.throws(() => buildPositions('252371,CM', positions, [...cards, cards[0]]), /중복 Gold/);
  assert.throws(() => buildPositions('252371,', positions, cards), /비어/);
});
