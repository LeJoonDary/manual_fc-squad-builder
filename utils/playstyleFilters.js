export async function fetchPlaystyleOptions(db) {
  if (!db) throw new Error('Supabase connection is not configured.');
  const options = [];
  for (let offset = 0; ; ) {
    const { data, error } = await db.from('playstyles').select('id,name,image_url,image_url_plus,category')
      .order('id').range(offset, offset + 499);
    if (error) throw error;
    if (!data?.length) return options.sort((a, b) => a.name.localeCompare(b.name));
    options.push(...data);
    offset += data.length;
  }
}

export const PLAYSTYLE_CATEGORIES = {
  Shooting: ['Finesse Shot', 'Chip Shot', 'Power Shot', 'Dead Ball', 'Precision Header', 'Acrobatic', 'Low Driven Shot', 'Gamechanger'],
  Passing: ['Incisive Pass', 'Pinged Pass', 'Long Ball Pass', 'Tiki Taka', 'Whipped Pass', 'Inventive'],
  Defending: ['Jockey', 'Block', 'Intercept', 'Anticipate', 'Slide Tackle', 'Aerial Fortress'],
  'Ball Control': ['Technical', 'Rapid', 'First Touch', 'Trickster', 'Press Proven'],
  Physical: ['Quick Step', 'Relentless', 'Long Throw', 'Bruiser', 'Enforcer'],
  Goalkeeper: ['Far Throw', 'Footwork', 'Cross Claimer', 'Rush Out', 'Far Reach', 'Deflector'],
};

export function groupPlaystyleOptions(options) {
  return Object.entries(PLAYSTYLE_CATEGORIES).map(([category, names]) => ({
    category,
    options: options.filter(option => option.image_url && option.image_url_plus && option.category === category)
      .sort((a, b) => (names.indexOf(a.name) < 0 ? 999 : names.indexOf(a.name))
        - (names.indexOf(b.name) < 0 ? 999 : names.indexOf(b.name)) || a.name.localeCompare(b.name)),
  }));
}

// Adapt independent UI selections to the existing RPC's exact (ID, level) predicates.
export function selectedPlaystyles(filters) {
  if (!filters.selectedNormalIds && !filters.selectedPlusIds) return filters.selectedPlayStyles ?? [];
  return [...new Set(filters.selectedNormalIds ?? [])].map(id => ({ id: Number(id), level: 'normal' })).concat(
    [...new Set(filters.selectedPlusIds ?? [])].map(id => ({ id: Number(id), level: 'plus' })),
  );
}

// Match the actual card_playstyles join, using master IDs and strict booleans.
export function matchesPlaystyleFilters(rows = [], filters) {
  const styles = [...new Map(rows.filter(row => row.is_plus === true || row.is_plus === false)
    .map(row => [`${row.playstyle_id}:${row.is_plus}`, row])).values()];
  const selected = selectedPlaystyles(filters);
  const match = selection => styles.some(row => String(row.playstyle_id) === String(selection.id)
    && row.is_plus === (selection.level === 'plus'));
  if (selected.length && !(filters.requireAllPlaystyles ? selected.every(match) : selected.some(match))) return false;
  const inRange = (count, min, max) => (min === '' || min == null || count >= Number(min))
    && (max === '' || max == null || count <= Number(max));
  return inRange(styles.filter(row => row.is_plus === false).length, filters.minPlaystyles, filters.maxPlaystyles)
    && inRange(styles.filter(row => row.is_plus === true).length, filters.minPlaystylesPlus, filters.maxPlaystylesPlus);
}
