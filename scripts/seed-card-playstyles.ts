import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';

type Id = number | string;
type Playstyle = { id: Id; name: string };
type Card = { id: Id; player_id: Id; version: string };
type RecordRow = { card_id: Id; playstyle_id: Id; is_plus: boolean };
const root = fileURLToPath(new URL('../', import.meta.url));
export const normalizeName = (name: string) => name.toLowerCase().replace(/\s+/g, '');
export const aliases: Record<string, string> = {
  [normalizeName('Cross Catcher')]: normalizeName('Cross Claimer'),
};
const pairKey = (row: RecordRow) => JSON.stringify([String(row.card_id), String(row.playstyle_id)]);
const goldKey = (id: Id) => JSON.stringify([String(id), 'Gold']);

export function buildPlaystyles(csv: string, playstyles: Playstyle[], cards: Card[]) {
  const names = new Map<string, Id>();
  for (const style of playstyles) {
    const name = normalizeName(style.name);
    if (names.has(name)) throw new Error(`DB 정규화 이름 중복: ${style.name}`);
    names.set(name, style.id);
  }
  const goldCards = new Map<string, Id>();
  for (const card of cards.filter(card => card.version === 'Gold')) {
    const key = goldKey(card.player_id);
    if (goldCards.has(key)) throw new Error(`중복 Gold 카드: player_id=${card.player_id}`);
    goldCards.set(key, card.id);
  }
  const rows: string[][] = parse(csv, { bom: true, trim: true, skip_empty_lines: true });
  let lineOffset = 1;
  if (rows[0]?.[0] === 'player_id') {
    if (rows[0].length !== 2 || !['player_playstyles', 'playstyles'].includes(rows[0][1])) {
      throw new Error('예상하지 못한 CSV 헤더');
    }
    rows.shift();
    lineOffset = 2;
  }
  if (!rows.length) throw new Error('CSV 데이터가 없습니다.');
  const result = new Map<string, RecordRow>();
  const targetIds = new Set<string>();
  const failures: string[] = [];
  const failureNames = new Map<string, number>();
  for (const [index, row] of rows.entries()) {
    const line = index + lineOffset;
    if (row.length !== 2 || !/^\d+$/.test(row[0])) {
      throw new Error(`CSV ${line}행 형식 오류`);
    }
    const playerId = BigInt(row[0]).toString();
    const cardId = goldCards.get(goldKey(playerId));
    if (cardId === undefined) {
      throw new Error(`CSV ${line}행 Gold 카드 매핑 실패: player_id=${playerId}`);
    }
    targetIds.add(String(cardId));
    // 이름 내부 공백은 구분자가 아님. 빈 목록은 플레이스타일 0건으로 처리.
    for (const token of row[1].split(/[,;|]/).map(value => value.trim()).filter(Boolean)) {
      const isPlus = token.endsWith('+');
      const normalized = normalizeName(isPlus ? token.slice(0, -1) : token);
      const canonical = aliases[normalized] ?? normalized;
      const styleId = names.get(canonical);
      if (styleId === undefined) {
        failures.push(`CSV ${line}행 플레이스타일 매핑 실패: "${token}" (player_id=${playerId}, 조회 이름=${canonical})`);
        const baseName = (isPlus ? token.slice(0, -1) : token).trim();
        failureNames.set(baseName, (failureNames.get(baseName) ?? 0) + 1);
        continue;
      }
      const record = { card_id: cardId, playstyle_id: styleId, is_plus: isPlus };
      const key = pairKey(record);
      const previous = result.get(key);
      if (previous && previous.is_plus !== isPlus) {
        throw new Error(`CSV ${line}행 일반/Plus 중복 충돌: "${token}" (player_id=${playerId})`);
      }
      result.set(key, record);
    }
  }
  // 미등록 이름만 건너뛰고 성공한 항목을 반환. 마스터 데이터는 변경하지 않음.
  return { records: [...result.values()], csvRows: rows.length, targetIds, failures, failureNames };
}

async function readAll<T>(db: SupabaseClient, table: string, columns: string, order: string[], goldOnly = false): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; ) {
    let query = db.from(table).select(columns);
    if (goldOnly) query = query.eq('version', 'Gold');
    for (const column of order) query = query.order(column);
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    if (!data?.length) return rows;
    rows.push(...data as unknown as T[]);
    offset += data.length;
  }
}

function indexRows(rows: RecordRow[]) {
  const result = new Map<string, RecordRow>();
  for (const row of rows) {
    const key = pairKey(row);
    if (result.has(key)) throw new Error(`DB 중복 card_id/playstyle_id: ${key}`);
    result.set(key, row);
  }
  return result;
}

async function main() {
  // 외부 환경변수 > .env.local > .env. 실행 위치와 무관하게 루트에서 로드.
  dotenv.config({ path: [path.join(root, '.env.local'), path.join(root, '.env')], quiet: true });
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('VITE_SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const styles = await readAll<Playstyle>(db, 'playstyles', 'id,name', ['id']);
  if (!styles.length) throw new Error('playstyles 마스터 목록이 비어 있습니다.');
  console.log(`최신 playstyles 마스터 ${styles.length}개 조회 완료`);
  const cards = await readAll<Card>(db, 'card_versions', 'id,player_id,version', ['id'], true);
  const { records, csvRows, targetIds, failures, failureNames } = buildPlaystyles(
    readFileSync(path.join(root, 'data/card_playstyles.csv'), 'utf8'), styles, cards,
  );
  for (const failure of failures) console.error(failure);
  const readSaved = () => readAll<RecordRow>(db, 'card_playstyles', 'card_id,playstyle_id,is_plus', ['card_id', 'playstyle_id']);
  const existing = indexRows((await readSaved()).filter(row => targetIds.has(String(row.card_id))));
  const newCount = records.filter(row => !existing.has(pairKey(row))).length;
  const changedCount = records.filter(row => existing.has(pairKey(row)) && existing.get(pairKey(row))!.is_plus !== row.is_plus).length;
  console.log(`CSV ${csvRows}행, Gold 카드 ${targetIds.size}개 → 플레이스타일 ${records.length}건 (매핑 실패 ${failures.length}건 제외)`);
  console.log(`신규 ${newCount}건 / 변경 ${changedCount}건 / 동일 ${records.length - newCount - changedCount}건`);
  if (process.argv.includes('--dry-run')) {
    console.log('사전 검증 완료 (DB 변경 없음)');
    return;
  }
  let fallback = false;
  for (let offset = 0; offset < records.length; offset += 200) {
    const batch = records.slice(offset, offset + 200);
    if (!fallback) {
      const { error } = await db.from('card_playstyles').upsert(batch, { onConflict: 'card_id,playstyle_id' });
      if (!error) continue;
      if (error.code !== '42P10') throw new Error(`Upsert 실패: ${error.message}`);
      fallback = true;
      console.log('복합 고유 제약 없음: 기존 행 갱신 / 신규 행 추가 방식 사용. 동시 실행은 지원하지 않습니다.');
    }
    for (const row of batch.filter(row => existing.has(pairKey(row)))) {
      if (existing.get(pairKey(row))!.is_plus === row.is_plus) continue;
      const { error } = await db.from('card_playstyles').update({ is_plus: row.is_plus })
        .eq('card_id', row.card_id).eq('playstyle_id', row.playstyle_id);
      if (error) throw new Error(`갱신 실패: ${error.message}`);
    }
    const missing = batch.filter(row => !existing.has(pairKey(row)));
    if (missing.length) {
      const { error } = await db.from('card_playstyles').insert(missing);
      if (error) throw new Error(`신규 적재 실패: ${error.message}`);
    }
  }
  const allSaved = await readSaved();
  const saved = indexRows(allSaved.filter(row => targetIds.has(String(row.card_id))));
  for (const row of records) {
    if (saved.get(pairKey(row))?.is_plus !== row.is_plus) throw new Error(`저장 값 검증 실패: ${pairKey(row)}`);
  }
  // CSV에 없는 기존 항목은 보존. 대상 카드의 전체 행 수도 확인.
  if (saved.size !== existing.size + newCount) throw new Error('적재 후 행 수 검증 실패');
  const plusCount = records.filter(row => saved.get(pairKey(row))!.is_plus).length;
  const masterAfter = await readAll<Playstyle>(db, 'playstyles', 'id,name', ['id']);
  if (JSON.stringify(masterAfter) !== JSON.stringify(styles)) throw new Error('실행 전후 마스터 목록이 달라졌습니다.');
  console.log(`적재 및 검증 완료: 일반 ${records.length - plusCount}건 / PlayStyle+ ${plusCount}건 / 합계 ${records.length}건 / 중복 0건`);
  console.log(`대상 카드 전체 ${saved.size}건 / card_playstyles 테이블 전체 ${allSaved.length}건`);
  console.log(`playstyles 마스터 ${styles.length}개: 실행 전후 동일`);
  console.log(`매핑 실패 ${failures.length}건: ${[...failureNames].map(([name, count]) => `${name} (${count}건)`).join(', ') || '없음'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : '플레이스타일 적재 실패');
    process.exitCode = 1;
  });
}
