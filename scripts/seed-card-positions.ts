import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';

type Id = string | number;
type Position = { id: Id; name: string };
type Card = { id: Id; player_id: Id; version: string };
type CardPosition = { card_id: Id; position_id: Id; is_primary: boolean };
const root = fileURLToPath(new URL('../', import.meta.url));
const pairKey = (row: CardPosition) => JSON.stringify([String(row.card_id), String(row.position_id)]);
const goldKey = (id: Id) => JSON.stringify([String(id), 'Gold']);

export function buildPositions(csv: string, positions: Position[], cards: Card[]) {
  const names = new Map<string, Id>();
  for (const position of positions) {
    const name = position.name.trim().toUpperCase();
    if (names.has(name)) throw new Error(`중복 포지션 이름: ${name}`);
    names.set(name, position.id);
  }
  const goldCards = new Map<string, Id>();
  for (const card of cards.filter(card => card.version === 'Gold')) {
    const key = goldKey(card.player_id);
    if (goldCards.has(key)) throw new Error(`중복 Gold 카드: ${card.player_id}`);
    goldCards.set(key, card.id);
  }
  const rows: string[][] = parse(csv, { bom: true, trim: true, skip_empty_lines: true });
  let lineOffset = 1;
  if (rows[0]?.[0] === 'player_id') {
    if (rows[0].join(',') !== 'player_id,player_positions') throw new Error('예상하지 못한 CSV 헤더');
    rows.shift();
    lineOffset = 2;
  }
  if (!rows.length) throw new Error('CSV 데이터가 없습니다.');
  const byCard = new Map<string, CardPosition[]>();
  for (const [index, row] of rows.entries()) {
    if (row.length !== 2 || !/^\d+$/.test(row[0])) throw new Error(`CSV ${index + lineOffset}행 형식 오류`);
    const playerId = BigInt(row[0]).toString();
    const cardId = goldCards.get(goldKey(playerId));
    if (cardId === undefined) throw new Error(`Gold 카드 매핑 실패: player_id=${playerId}`);
    const tokens = [...new Set(row[1].toUpperCase().split(/[,;|/\s]+/).filter(Boolean))];
    if (!tokens.length) throw new Error(`포지션이 비어 있습니다: player_id=${playerId}`);
    const mapped = tokens.map((name, i) => {
      const positionId = names.get(name);
      if (positionId === undefined) throw new Error(`포지션 매핑 실패: ${name}, player_id=${playerId}`);
      return { card_id: cardId, position_id: positionId, is_primary: i === 0 };
    });
    const previous = byCard.get(String(cardId));
    if (previous && JSON.stringify(previous) !== JSON.stringify(mapped)) {
      throw new Error(`CSV 내 상충하는 포지션 목록: player_id=${playerId}`);
    }
    byCard.set(String(cardId), mapped);
  }
  return { records: [...byCard.values()].flat(), csvRows: rows.length, cardCount: byCard.size };
}

async function readAll<T>(db: SupabaseClient, table: string, columns: string, order: string[], goldOnly = false): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; ) {
    let query = db.from(table).select(columns);
    if (goldOnly) query = query.eq('version', 'Gold');
    for (const column of order) query = query.order(column);
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    if (!data?.length) return result;
    result.push(...data as unknown as T[]);
    offset += data.length;
  }
}

function indexExisting(rows: CardPosition[]) {
  const result = new Map<string, CardPosition>();
  for (const row of rows) {
    const key = pairKey(row);
    if (result.has(key)) throw new Error(`DB에 중복 card_id/position_id가 있습니다: ${key}`);
    result.set(key, row);
  }
  return result;
}

async function main() {
  // 외부 환경변수 > .env.local > .env; 실행 디렉터리에 의존하지 않음.
  dotenv.config({ path: [path.join(root, '.env.local'), path.join(root, '.env')], quiet: true });
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('VITE_SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const positions = await readAll<Position>(db, 'positions', 'id,name', ['id']);
  const cards = await readAll<Card>(db, 'card_versions', 'id,player_id,version', ['id'], true);
  const { records, csvRows, cardCount } = buildPositions(
    readFileSync(path.join(root, 'data/card_positions.csv'), 'utf8'), positions, cards,
  );
  const targetIds = new Set(records.map(row => String(row.card_id)));
  const existingRows = (await readAll<CardPosition>(db, 'card_positions', 'card_id,position_id,is_primary', ['card_id', 'position_id']))
    .filter(row => targetIds.has(String(row.card_id)));
  const existing = indexExisting(existingRows);
  const expectedPrimary = new Map(records.filter(row => row.is_primary).map(row => [String(row.card_id), String(row.position_id)]));
  console.log(`CSV ${csvRows}행 → Gold 카드 ${cardCount}개, 포지션 ${records.length}건 매핑 완료`);
  console.log(`신규 ${records.filter(row => !existing.has(pairKey(row))).length}건, 기존 ${records.filter(row => existing.has(pairKey(row))).length}건`);
  if (process.argv.includes('--dry-run')) {
    console.log('사전 검증 완료 (DB 변경 없음)');
    return;
  }

  // 이전 주 포지션을 먼저 해제하여 카드당 주 포지션 UNIQUE 제약에도 대응.
  // CSV에 없는 기존 보조 포지션은 삭제하지 않음.
  for (const row of existingRows.filter(row => row.is_primary && expectedPrimary.get(String(row.card_id)) !== String(row.position_id))) {
    const { error } = await db.from('card_positions').update({ is_primary: false })
      .eq('card_id', row.card_id).eq('position_id', row.position_id);
    if (error) throw new Error(`이전 주 포지션 갱신 실패: ${error.message}`);
  }
  let fallback = false;
  for (let offset = 0; offset < records.length; offset += 200) {
    const batch = records.slice(offset, offset + 200);
    if (!fallback) {
      const { error } = await db.from('card_positions').upsert(batch, { onConflict: 'card_id,position_id' });
      if (!error) continue;
      if (error.code !== '42P10') throw new Error(`Upsert 실패: ${error.message}`);
      fallback = true;
      console.log('복합 고유 제약 없음: 기존 행 갱신 / 신규 행 추가 방식 사용. 동시 실행은 지원하지 않습니다.');
    }
    // 고유 제약 없는 DB에서도 순차 재실행 시 중복을 추가하지 않음.
    for (const row of batch.filter(row => existing.has(pairKey(row)))) {
      if (existing.get(pairKey(row))!.is_primary === row.is_primary) continue;
      const { error } = await db.from('card_positions').update({ is_primary: row.is_primary })
        .eq('card_id', row.card_id).eq('position_id', row.position_id);
      if (error) throw new Error(`포지션 갱신 실패: ${error.message}`);
    }
    const missing = batch.filter(row => !existing.has(pairKey(row)));
    if (missing.length) {
      const { error } = await db.from('card_positions').insert(missing);
      if (error) throw new Error(`신규 포지션 적재 실패: ${error.message}`);
    }
  }
  const allSaved = await readAll<CardPosition>(db, 'card_positions', 'card_id,position_id,is_primary', ['card_id', 'position_id']);
  const saved = allSaved.filter(row => targetIds.has(String(row.card_id)));
  const savedIndex = indexExisting(saved);
  for (const row of records) {
    if (savedIndex.get(pairKey(row))?.is_primary !== row.is_primary) throw new Error(`적재 값 검증 실패: ${pairKey(row)}`);
  }
  for (const cardId of targetIds) {
    const primary = saved.filter(row => String(row.card_id) === cardId && row.is_primary);
    if (primary.length !== 1 || String(primary[0].position_id) !== expectedPrimary.get(cardId)) {
      throw new Error(`주 포지션 검증 실패: card_id=${cardId}`);
    }
  }
  if (saved.length !== new Set([...existing.keys(), ...records.map(pairKey)]).size) throw new Error('적재 후 행 수 검증 실패');
  console.log(`검증 완료: CSV 포지션 ${records.length}건, 주 포지션 ${cardCount}건, 중복 0건`);
  console.log(`대상 카드의 전체 포지션 ${saved.length}건 / card_positions 테이블 전체 ${allSaved.length}건`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : '포지션 적재 실패');
    process.exitCode = 1;
  });
}
