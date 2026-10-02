export const PLAYER_CARD_SELECT = `
  *, players!inner (*, nations (name, flag_url)), clubs (id, name), leagues (id, name),
  player_stats (*),
  card_playstyles (playstyle_id, is_plus, playstyles (id, name, image_url, image_url_plus)),
  card_roles (role_level, roles (position, role_name)),
  card_positions (is_primary, positions (name))
`;

export async function fetchPlayerCards(db) {
  if (!db) throw new Error('Supabase connection is not configured.');
  const rows = [];
  for (let offset = 0; ; ) {
    const { data, error } = await db.from('card_versions').select(PLAYER_CARD_SELECT)
      .order('id').range(offset, offset + 499);
    if (error) throw error;
    if (!data?.length) return rows;
    rows.push(...data);
    offset += data.length;
  }
}
