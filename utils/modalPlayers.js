export const MODAL_PAGE_SIZE = 30;

// Explicit fields used by the list, its scores and cards placed on the pitch.
export const MODAL_PLAYER_SELECT = `
  id,player_id,overall,price,image_url,background_url,version,card_type,club_id,league_id,
  sm,wf,preferred_foot,accele_type,body_type,
  players!inner(id,name,long_name,nation_id,height,weight,age,gender,nations(name,flag_url)),
  clubs(name,short_name),leagues(name,short_name),
  player_stats(pac,sho,pas,dri,def,phy,gk_reflexes,gk_diving,gk_positioning,gk_handling,reactions),
  card_positions(is_primary,positions(name)),
  card_roles(role_level,roles(position,role_name)),
  card_playstyles(is_plus,playstyles(id,name))
`;

export async function fetchModalPlayerPage(db, { position, keyword = '', offset = 0, signal }) {
  if (!db) throw new Error('Supabase 연결 설정이 없습니다.');
  // Inner joins apply both filters to the root cards BEFORE limit/range.
  let query = db.from('card_versions').select(
    'id,players!inner(name),slot_positions:card_positions!inner(positions!inner(name))'
  ).eq('slot_positions.positions.name', position);
  const term = keyword.trim();
  if (term) {
    // Quote PostgREST values so commas/parentheses cannot become OR syntax.
    const pattern = JSON.stringify(`%${term.replace(/[\\%_]/g, '\\$&')}%`);
    query = query.or(`name.ilike.${pattern},long_name.ilike.${pattern}`, { referencedTable: 'players' });
  }
  const { data, error } = await query.order('overall', { ascending: false, nullsFirst: false })
    .order('id').limit(MODAL_PAGE_SIZE).range(offset, offset + MODAL_PAGE_SIZE - 1).abortSignal(signal);
  if (error) throw error;
  if (!data?.length) return [];
  const { data: details, error: detailError } = await db.from('card_versions')
    .select(MODAL_PLAYER_SELECT).in('id', data.map(row => row.id)).limit(MODAL_PAGE_SIZE).abortSignal(signal);
  if (detailError) throw detailError;
  const byId = new Map((details ?? []).map(row => [String(row.id), row]));
  if (data.some(row => !byId.has(String(row.id)))) throw new Error('선수 정보를 다시 불러와 주세요.');
  return data.map(row => byId.get(String(row.id)));
}
