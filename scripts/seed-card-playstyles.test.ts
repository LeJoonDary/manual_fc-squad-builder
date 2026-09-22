import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buildPlaystyles } from './seed-card-playstyles.ts';

const styles = [{ id: 1, name: 'Finesse Shot' }, { id: 2, name: 'Cross Claimer' }];
const cards = [{ id: 10, player_id: 123, version: 'Gold' }, { id: 20, player_id: 123, version: 'Silver' }];

test('헤더 없는 첫 행, 대소문자/공백 및 Plus 처리', () => {
  assert.deepEqual(buildPlaystyles('123," fINesse  SHot +, Cross Catcher "', styles, cards).records, [
    { card_id: 10, playstyle_id: 1, is_plus: true },
    { card_id: 10, playstyle_id: 2, is_plus: false },
  ]);
});
test('별칭에도 Plus 적용, BOM/헤더 및 동일 중복 제거', () => {
  const result = buildPlaystyles('\uFEFFplayer_id,player_playstyles\n123,"Cross Catcher+;crossclaimer +"\n123,CROSS CATCHER+', styles, cards);
  assert.deepEqual(result.records, [{ card_id: 10, playstyle_id: 2, is_plus: true }]);
});
test('모든 실패 이름을 수집하고 명확히 표시', () => {
  const result = buildPlaystyles('123,"Missing One, Missing Two+, Finesse Shot+"', styles, cards);
  assert.equal(result.failures.length, 2);
  assert.match(result.failures[0], /Missing One.*player_id=123/);
  assert.match(result.failures[1], /Missing Two\+.*player_id=123/);
  assert.deepEqual(result.records, [{ card_id: 10, playstyle_id: 1, is_plus: true }]);
  assert.equal(result.failureNames.get('Missing Two'), 1);
});
test('별칭 대상이 DB에 없으면 마스터를 변경하지 않고 실패로 반환', () => {
  const master = [{ id: 2, name: 'Cross Catcher' }];
  const before = JSON.stringify(master);
  const result = buildPlaystyles('123,Cross Catcher+', master, cards);
  assert.equal(result.records.length, 0);
  assert.match(result.failures[0], /crossclaimer/);
  assert.equal(JSON.stringify(master), before);
});
test('상충하는 Plus 값, Gold 중복, 이름 충돌 및 카드 누락 거부', () => {
  assert.throws(() => buildPlaystyles('123,"Finesse Shot,Finesse Shot+"', styles, cards), /중복 충돌/);
  assert.throws(() => buildPlaystyles('123,Finesse Shot', styles, [...cards, cards[0]]), /중복 Gold/);
  assert.throws(() => buildPlaystyles('123,Finesse Shot', [...styles, { id: 3, name: 'finesseshot' }], cards), /이름 중복/);
  assert.throws(() => buildPlaystyles('999,Finesse Shot', styles, cards), /Gold 카드 매핑 실패/);
});
test('빈 목록은 일반/Plus 0건', () => {
  assert.equal(buildPlaystyles('123,', styles, cards).records.length, 0);
});
