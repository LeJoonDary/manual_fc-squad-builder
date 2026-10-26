import { getPlaystyleName } from './playstyleNames.js';

function unwrapRelation(value) {
  return Array.isArray(value) ? value[0] : value;
}

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function parsePlaystyleSource(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export function normalizePlaystyles(...records) {
  const normalized = new Map();

  const addSource = (source, forcedPlus = null) => {
    const parsed = parsePlaystyleSource(source);
    asArray(parsed).forEach((entry) => {
      let safeEntry = parsePlaystyleSource(entry);
      if (Array.isArray(safeEntry)) {
        safeEntry.forEach((item) => addSource(item, forcedPlus));
        return;
      }

      if (typeof safeEntry === 'number') safeEntry = { id: safeEntry };
      if (typeof safeEntry === 'string') {
        const name = getPlaystyleName(safeEntry);
        const key = `${name.toLowerCase()}|${Boolean(forcedPlus)}`;
        if (name && !normalized.has(key)) normalized.set(key, { name, isPlus: Boolean(forcedPlus) });
        return;
      }
      if (!safeEntry || typeof safeEntry !== 'object') return;

      const relation = unwrapRelation(
        safeEntry.playstyles ?? safeEntry.playStyles ?? safeEntry.play_styles ?? safeEntry.playstyle ?? safeEntry.trait,
      );
      const sourceObject = relation && typeof relation === 'object' ? relation : safeEntry;
      const playstyleId = safeEntry.playstyle_id ?? safeEntry.id ?? safeEntry.playstyleId
        ?? sourceObject.playstyle_id ?? sourceObject.id ?? sourceObject.playstyleId;
      const name = getPlaystyleName({
        playstyle_id: playstyleId,
        name: sourceObject.name ?? sourceObject.playstyle_name ?? sourceObject.playStyleName
          ?? sourceObject.trait_name ?? sourceObject.label,
      });

      const rawLevel = safeEntry.level ?? sourceObject.level;
      const levelIsPlus = (typeof rawLevel === 'string' && rawLevel.toLowerCase().includes('plus'))
        || (Number.isFinite(Number(rawLevel)) && Number(rawLevel) > 0);
      const isPlus = forcedPlus ?? Boolean(
        safeEntry.is_plus ?? safeEntry.isPlus ?? safeEntry.plus
        ?? sourceObject.is_plus ?? sourceObject.isPlus ?? sourceObject.plus
        ?? levelIsPlus,
      );
      const cleanName = name.trim().replace(/\+$/, '').trim();
      const plusFromName = /\+$/.test(name.trim());
      const key = `${cleanName === 'PlayStyle' ? playstyleId ?? cleanName : cleanName.toLowerCase()}|${isPlus || plusFromName}`;
      const previous = normalized.get(key);
      normalized.set(key, {
        name: cleanName,
        isPlus: isPlus || plusFromName,
        image_url: sourceObject.image_url || previous?.image_url,
        image_url_plus: sourceObject.image_url_plus || previous?.image_url_plus,
      });
    });
  };

  records.filter((record) => record && typeof record === 'object').forEach((record) => {
    [record.card_playstyles, record.playstyles, record.playStyles, record.play_styles, record.traits, record.playstyle_ids]
      .forEach((source) => addSource(source));
    [record.normalPlayStyles, record.normal_playstyles, record.normal_play_styles]
      .forEach((source) => addSource(source, false));
    [record.playStylePlus, record.playStylesPlus, record.play_style_plus, record.play_styles_plus, record.traitsPlus]
      .forEach((source) => addSource(source, true));
  });

  return [...normalized.values()].sort((left, right) => Number(right.isPlus) - Number(left.isPlus) || left.name.localeCompare(right.name));
}

