export async function fetchPlaystyleOptions(db) {
  if (!db) throw new Error('Supabase 연결 설정이 없습니다.');
  const options = [];
  for (let offset = 0; ; ) {
    const { data, error } = await db.from('playstyles').select('id,name').order('id').range(offset, offset + 499);
    if (error) throw error;
    if (!data?.length) return options.sort((a, b) => a.name.localeCompare(b.name));
    options.push(...data);
    offset += data.length;
  }
}

// Match the actual card_playstyles join, using master IDs and strict booleans.
export function matchesPlaystyleFilters(rows = [], filters) {
  const styles = [...new Map(rows.filter(row => row.is_plus === true || row.is_plus === false)
    .map(row => [`${row.playstyle_id}:${row.is_plus}`, row])).values()];
  const selected = filters.selectedPlayStyles ?? [];
  const match = selection => styles.some(row => String(row.playstyle_id) === String(selection.id)
    && row.is_plus === (selection.level === 'plus'));
  if (selected.length && !(filters.requireAllPlaystyles ? selected.every(match) : selected.some(match))) return false;
  const inRange = (count, min, max) => (min === '' || min == null || count >= Number(min))
    && (max === '' || max == null || count <= Number(max));
  return inRange(styles.filter(row => row.is_plus === false).length, filters.minPlaystyles, filters.maxPlaystyles)
    && inRange(styles.filter(row => row.is_plus === true).length, filters.minPlaystylesPlus, filters.maxPlaystylesPlus);
}
