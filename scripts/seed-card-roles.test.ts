import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buildCardRoles } from './seed-card-roles.ts';

const positions = [{ id: 1, name: 'ST' }, { id: 2, name: 'CM' }];
const roles = [
  { id: 1, position: 'ST', role_name: 'Forward' },
  { id: 2, position: 'ST', role_name: 'Poacher' },
  { id: 3, position: 'ST', role_name: 'Target' },
  { id: 4, position: 'CM', role_name: 'Holding' },
  { id: 5, position: 'CM', role_name: 'Playmaker' },
];
test('여러 포지션을 번갈아 반영하고 카드당 레벨 2/1/1/1 선택', () => {
  const result = buildCardRoles([{ card_id: 10, position_id: 2 }, { card_id: 10, position_id: 1 }], positions, roles);
  assert.deepEqual(result.map(row => row.role_id), [1, 4, 2, 5]);
  assert.deepEqual(result.map(row => row.role_level), [2, 1, 1, 1]);
  assert.ok(result.every(row => row.card_id === 10));
});
test('입력 순서와 중복 포지션에 무관하게 동일한 롤 선택', () => {
  const rows = [{ card_id: 10, position_id: 1 }, { card_id: 10, position_id: 2 }];
  assert.deepEqual(buildCardRoles([...rows].reverse().concat(rows), positions, [...roles].reverse()), buildCardRoles(rows, positions, roles));
});
test('롤 후보가 4개 미만이면 적재 전 중단', () => {
  assert.throws(() => buildCardRoles([{ card_id: 10, position_id: 2 }], positions, roles), /카드당 롤 4개 필요/);
});
test('99개 카드 각각 정확히 한 개의 Role++와 나머지 Role+ 할당', () => {
  const rows = Array.from({ length: 99 }, (_, index) => [
    { card_id: index + 1, position_id: 1 }, { card_id: index + 1, position_id: 2 },
  ]).flat();
  const result = buildCardRoles(rows, positions, roles);
  assert.equal(result.filter(row => row.role_level === 2).length, 99);
  for (let cardId = 1; cardId <= 99; cardId++) {
    assert.deepEqual(result.filter(row => row.card_id === cardId).map(row => row.role_level), [2, 1, 1, 1]);
  }
});
test('없는 포지션, 롤 누락, 중복 롤 ID는 적재 전 오류', () => {
  assert.throws(() => buildCardRoles([{ card_id: 10, position_id: 9 }], positions, roles), /포지션 매핑 실패/);
  assert.throws(() => buildCardRoles([{ card_id: 10, position_id: 1 }], positions, []), /롤 없음/);
  assert.throws(() => buildCardRoles([], positions, [...roles, roles[0]]), /중복 role_id/);
});

