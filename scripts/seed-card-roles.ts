import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Id = number | string;
type CardPosition = { card_id: Id; position_id: Id };
type Position = { id: Id; name: string };
type Role = { id: Id; position: string; role_name: string };
type CardRole = { card_id: Id; role_id: Id; role_level: number };
const root = fileURLToPath(new URL('../', import.meta.url));
const compareId = (a: Id, b: Id) => String(a).localeCompare(String(b), 'en', { numeric: true });
const pairKey = (row: CardRole) => JSON.stringify([String(row.card_id), String(row.role_id)]);

export function buildCardRoles(cardPositions: CardPosition[], positions: Position[], roles: Role[]): CardRole[] {
  const names = new Map(positions.map(position => [String(position.id), position.name]));
  const byPosition = new Map<string, Role[]>();
  const roleIds = new Set<string>();
  for (const role of [...roles].sort((a, b) => compareId(a.id, b.id))) {
    if (roleIds.has(String(role.id))) throw new Error(`중복 role_id: ${role.id}`);
    roleIds.add(String(role.id));
    const list = byPosition.get(role.position) ?? [];
    list.push(role);
    byPosition.set(role.position, list);
  }
  const byCard = new Map<string, { id: Id; positions: Set<string> }>();
  for (const row of cardPositions) {
    if (!names.has(String(row.position_id))) throw new Error(`포지션 매핑 실패: card_id=${row.card_id}, position_id=${row.position_id}`);
    const card = byCard.get(String(row.card_id)) ?? { id: row.card_id, positions: new Set<string>() };
    card.positions.add(String(row.position_id));
    byCard.set(String(row.card_id), card);
  }
  const result: CardRole[] = [];
  for (const card of [...byCard.values()].sort((a, b) => compareId(a.id, b.id))) {
    const groups = [...card.positions].sort(compareId).map(id => {
      const name = names.get(id)!;
      const group = byPosition.get(name);
      if (!group?.length) throw new Error(`해당 포지션의 롤 없음: card_id=${card.id}, position=${name}`);
      return group;
    });
    // 포지션 ID 순으로 하나씩 번갈아 선택하여 여러 포지션을 반영.
    // 입력 순서/재실행과 무관하게 카드당 4개, 레벨 2/1/1/1로 고정.
    const chosen: Role[] = [];
    for (let index = 0; chosen.length < 4; index++) {
      let found = false;
      for (const group of groups) {
        if (group[index]) {
          chosen.push(group[index]);
          found = true;
        }
        if (chosen.length === 4) break;
      }
      if (!found) break;
    }
    if (chosen.length !== 4) throw new Error(`카드당 롤 4개 필요: card_id=${card.id}, 후보=${chosen.length}개`);
    result.push(...chosen.map((role, index) => ({ card_id: card.id, role_id: role.id, role_level: index === 0 ? 2 : 1 })));
  }
  return result;
}

async function readAll<T>(db: SupabaseClient, table: string, columns: string, order: string[]): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; ) {
    let query = db.from(table).select(columns);
    for (const column of order) query = query.order(column);
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    if (!data?.length) return result;
    result.push(...data as unknown as T[]);
    offset += data.length;
  }
}

function indexRows(rows: CardRole[]) {
  const result = new Map<string, CardRole>();
  for (const row of rows) {
    const key = pairKey(row);
    if (result.has(key)) throw new Error(`DB 중복 card_id/role_id: ${key}`);
    result.set(key, row);
  }
  return result;
}

async function main() {
  dotenv.config({ path: [path.join(root, '.env.local'), path.join(root, '.env')], quiet: true });
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('VITE_SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const cardPositions = await readAll<CardPosition>(db, 'card_positions', 'card_id,position_id', ['card_id', 'position_id']);
  const positions = await readAll<Position>(db, 'positions', 'id,name', ['id']);
  const roles = await readAll<Role>(db, 'roles', 'id,position,role_name', ['id']);
  const records = buildCardRoles(cardPositions, positions, roles);
  const readSaved = () => readAll<CardRole>(db, 'card_roles', 'card_id,role_id,role_level', ['card_id', 'role_id']);
  const before = indexRows(await readSaved());
  const targetIds = new Set(records.map(row => String(row.card_id)));
  const planned = new Map(before);
  records.forEach(row => planned.set(pairKey(row), row));
  for (const cardId of targetIds) {
    if ([...planned.values()].filter(row => String(row.card_id) === cardId).length > 4) {
      throw new Error(`기존 롤과 합치면 최대 4개 초과: card_id=${cardId}. 기존 데이터 확인 필요`);
    }
  }
  const missingCount = records.filter(row => !before.has(pairKey(row))).length;
  const changedCount = records.filter(row => before.has(pairKey(row)) && before.get(pairKey(row))!.role_level !== row.role_level).length;
  console.log(`포지션 ${positions.length}종, 롤 ${roles.length}종, 카드 포지션 ${cardPositions.length}건 조회`);
  console.log(`카드 ${targetIds.size}개 → 롤 ${records.length}건 (카드당 레벨 2/1/1/1)`);
  console.log(`신규 ${missingCount}건 / 변경 ${changedCount}건 / 동일 ${records.length - missingCount - changedCount}건`);
  if (process.argv.includes('--dry-run')) return;
  let fallback = false;
  for (let offset = 0; offset < records.length; offset += 200) {
    const batch = records.slice(offset, offset + 200);
    if (!fallback) {
      const { error } = await db.from('card_roles').upsert(batch, { onConflict: 'card_id,role_id' });
      if (!error) continue;
      if (error.code !== '42P10') throw new Error(`Upsert 실패: ${error.message}`);
      fallback = true;
      console.log('복합 고유 제약 없음: 기존 행 갱신 / 신규 행 추가 방식 사용. 동시 실행은 지원하지 않습니다.');
    }
    for (const row of batch.filter(row => before.has(pairKey(row)))) {
      if (before.get(pairKey(row))!.role_level === row.role_level) continue;
      const { error } = await db.from('card_roles').update({ role_level: row.role_level })
        .eq('card_id', row.card_id).eq('role_id', row.role_id);
      if (error) throw new Error(`롤 갱신 실패: ${error.message}`);
    }
    const missing = batch.filter(row => !before.has(pairKey(row)));
    if (missing.length) {
      const { error } = await db.from('card_roles').insert(missing);
      if (error) throw new Error(`신규 적재 실패: ${error.message}`);
    }
  }
  const saved = indexRows(await readSaved());
  if (saved.size !== planned.size) throw new Error('최종 행 수 검증 실패');
  for (const [key, row] of planned) {
    if (saved.get(key)?.role_level !== row.role_level) throw new Error(`저장 값 검증 실패: ${key}`);
  }
  for (const cardId of targetIds) {
    const levels = [...saved.values()].filter(row => String(row.card_id) === cardId)
      .map(row => row.role_level).sort((a, b) => b - a);
    if (levels.join(',') !== '2,1,1,1') throw new Error(`카드별 레벨 분포 검증 실패: card_id=${cardId}, levels=${levels}`);
  }
  // DB에서 레벨별 exact COUNT를 별도 조회하여 전체 건수도 확인.
  for (const level of [3, 2, 1]) {
    const { count, error } = await db.from('card_roles').select('card_id', { count: 'exact', head: true })
      .eq('role_level', level);
    if (error) throw new Error(`레벨 ${level} COUNT 조회 실패: ${error.message}`);
    const expected = [...saved.values()].filter(row => row.role_level === level).length;
    if (count !== expected) throw new Error(`레벨 ${level} COUNT 불일치: ${count} / ${expected}`);
    console.log(`DB COUNT 검증: role_level=${level} → ${count}건`);
  }
  console.log(`카드별 분포 검증: ${targetIds.size}개 카드 모두 Role++(level 2) 1개 / Role+(level 1) 3개`);
  console.log(`적재 및 검증 완료: 신규 ${missingCount}건 / 대상 카드 롤 ${records.length}건 / 테이블 전체 ${saved.size}건 / 중복 0건`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : '카드 롤 적재 실패');
    process.exitCode = 1;
  });
}

