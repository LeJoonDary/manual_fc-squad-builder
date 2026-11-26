let cache;
export function skinLabel(version) { return String(version).replace(/^special_/i, '').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()); }
export async function loadCardSkins(db) {
  if (!db) return [];
  if (cache) return cache;
  cache = (async () => {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db.from('card_versions').select('version,background_url')
        .not('background_url','is',null).or('version.ilike.gold,version.ilike.special_*')
        .not('version','ilike','special_totw*').order('id').range(offset,offset+499);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
    const sorted = rows.filter(r => r.background_url && (String(r.version).toLowerCase() === 'gold' || /^special_(?!totw(?:_|$))/i.test(r.version)))
      .sort((a,b) => Number(String(b.version).toLowerCase() === 'gold') - Number(String(a.version).toLowerCase() === 'gold') || a.version.localeCompare(b.version));
    const seen = new Set();
    return sorted.filter(row => { if (seen.has(row.background_url)) return false; seen.add(row.background_url); return true; });
  })().catch(error => { cache = null; throw error; });
  return cache;
}
