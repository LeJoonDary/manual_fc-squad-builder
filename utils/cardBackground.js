// Keep every card surface on the same DB-first background path.
export function getCardBackground(card, storageUrl = import.meta.env.VITE_SUPABASE_URL) {
  const background = card.raw?.background_url || card.background_url;
  const version = String(card.version ?? card.raw?.version ?? '').toLowerCase();
  if (version !== 'special_sbc') return background || '';
  if (background) return background.replace('/card-templates/spcial_ones_to_watch_edited.png', '/card-templates/special_ones_to_watch_edited.png');
  return storageUrl ? `${storageUrl.replace(/\/$/, '')}/storage/v1/object/public/card-templates/special_ones_to_watch_edited.png` : '';
}
