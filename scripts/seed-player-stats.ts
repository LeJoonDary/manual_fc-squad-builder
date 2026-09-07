import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';

// 실행 위치와 무관하게 프로젝트 루트를 사용. 외부 환경변수 > .env.local > .env.
const root = fileURLToPath(new URL('../', import.meta.url));
dotenv.config({ path: [path.join(root, '.env.local'), path.join(root, '.env')], quiet: true });
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('VITE_SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// 헤더 없는 CSV의 실제 열 순서.
const statColumns = [
  'pac', 'sho', 'pas', 'dri', 'def', 'phy',
  'acceleration', 'sprint_speed', 'positioning', 'finishing', 'shot_power',
  'long_shots', 'volleys', 'penalties', 'vision', 'crossing', 'fk_accuracy',
  'short_passing', 'long_passing', 'curve', 'agility', 'balance', 'reactions',
  'ball_control', 'dribbling_sub', 'composure', 'interceptions', 'heading_accuracy',
  'def_awareness', 'standing_tackle', 'sliding_tackle', 'jumping', 'stamina',
  'strength', 'aggression', 'gk_diving', 'gk_handling', 'gk_kicking',
  'gk_positioning', 'gk_reflexes',
];
const compositeKey = (playerId: string, version: string) => JSON.stringify([playerId, version]);

async function seedPlayerStats() {
  const rows: string[][] = parse(readFileSync(path.join(root, 'data/player_stats.csv'), 'utf8'), {
    bom: true, skip_empty_lines: true, trim: true,
  });
  if (rows[0]?.[0] === 'player_id') {
    if (rows[0].join(',') !== ['player_id', ...statColumns].join(',')) {
      throw new Error('CSV 헤더의 열 순서가 예상과 다릅니다.');
    }
    rows.shift();
  }
  if (!rows.length) throw new Error('CSV에 데이터가 없습니다.');

  const cards = new Map<string, number | string>();
  // Supabase의 응답 행 제한으로 누락되지 않도록 페이지별 조회.
  for (let offset = 0; ; ) {
    const { data, error } = await supabase.from('card_versions')
      .select('id, player_id, version').eq('version', 'Gold')
      .order('id').range(offset, offset + 499);
    if (error) throw new Error(`카드 조회 실패: ${error.message}`);
    if (!data?.length) break;
    for (const card of data) {
      const lookup = compositeKey(String(card.player_id), card.version);
      if (cards.has(lookup)) throw new Error(`중복 카드 매핑: ${lookup}`);
      cards.set(lookup, card.id);
    }
    offset += data.length;
  }
  console.log(`Gold 카드 ${cards.size}개, CSV ${rows.length}행 확인`);

  const stats = new Map<number | string, Record<string, number | string>>();
  for (const [index, row] of rows.entries()) {
    if (row.length !== statColumns.length + 1) throw new Error(`CSV ${index + 1}행 열 수 오류`);
    if (!/^\d+$/.test(row[0])) throw new Error(`CSV ${index + 1}행 player_id 오류`);
    const playerId = BigInt(row[0]).toString();
    const cardId = cards.get(compositeKey(playerId, 'Gold'));
    if (cardId === undefined) throw new Error(`Gold 카드 매핑 실패: player_id=${playerId}`);
    const record: Record<string, number | string> = { card_id: cardId };
    statColumns.forEach((column, i) => {
      const value = Number(row[i + 1]);
      if (row[i + 1] === '' || !Number.isInteger(value) || value < 0 || value > 99) {
        throw new Error(`CSV ${index + 1}행 ${column} 값 오류`);
      }
      record[column] = value;
    });
    const previous = stats.get(cardId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(record)) {
      throw new Error(`CSV 내 상충하는 중복 데이터: card_id=${cardId}`);
    }
    stats.set(cardId, record);
  }

  const records = [...stats.values()];
  // card_id의 DB UNIQUE/PRIMARY KEY 제약을 사용. 실패 시 INSERT로 우회하지 않음.
  for (let offset = 0; offset < records.length; offset += 200) {
    const batch = records.slice(offset, offset + 200);
    const { error } = await supabase.from('player_stats').upsert(batch, { onConflict: 'card_id' });
    if (error?.code === '42P10') {
      // 고유 제약이 없는 기존 DB: 순차 재실행 시 기존 행을 갱신하고 없는 행만 추가.
      // 동시 실행까지 보장하려면 함께 제공한 고유 인덱스 마이그레이션을 적용해야 함.
      const { data: existing, error: lookupError } = await supabase.from('player_stats')
        .select('card_id').in('card_id', batch.map(record => record.card_id));
      if (lookupError) throw new Error(`기존 데이터 조회 실패: ${lookupError.message}`);
      const existingIds = new Set<string>();
      for (const row of existing ?? []) {
        const id = String(row.card_id);
        if (existingIds.has(id)) throw new Error(`DB에 중복 card_id가 있습니다: ${id}`);
        existingIds.add(id);
      }
      console.log('card_id 고유 제약 없음: 기존 행 갱신 / 신규 행 추가 방식 사용 (동시 실행 금지)');
      for (const record of batch.filter(row => existingIds.has(String(row.card_id)))) {
        const { error: updateError } = await supabase.from('player_stats')
          .update(record).eq('card_id', record.card_id);
        if (updateError) throw new Error(`갱신 실패: ${updateError.message}`);
      }
      const missing = batch.filter(row => !existingIds.has(String(row.card_id)));
      if (missing.length) {
        const { error: insertError } = await supabase.from('player_stats').insert(missing);
        if (insertError) throw new Error(`신규 적재 실패: ${insertError.message}`);
      }
    } else if (error) {
      throw new Error(`적재 실패 (${offset}건 완료): ${error.message}`);
    }
    const { data, error: verifyError } = await supabase.from('player_stats')
      .select(['card_id', ...statColumns].join(','))
      .in('card_id', batch.map(record => record.card_id));
    if (verifyError) throw new Error(`검증 조회 실패: ${verifyError.message}`);
    if (data?.length !== batch.length) throw new Error('적재 후 행 수 검증 실패');
    const saved = new Map((data as unknown as Record<string, number | string>[]).map(row => [String(row.card_id), row]));
    for (const expected of batch) {
      const actual = saved.get(String(expected.card_id));
      if (!actual || statColumns.some(column => actual[column] !== expected[column])) {
        throw new Error(`적재 후 값 검증 실패: card_id=${expected.card_id}`);
      }
    }
    console.log(`${offset + batch.length}/${records.length}건 upsert 및 값 검증 완료`);
  }
  console.log(`적재 완료: ${records.length}건 (CSV 동일 중복 ${rows.length - records.length}행 제외)`);
}

seedPlayerStats().catch(error => {
  console.error(error instanceof Error ? error.message : '알 수 없는 적재 오류');
  process.exitCode = 1;
});
