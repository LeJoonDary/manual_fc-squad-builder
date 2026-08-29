import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Supabase URL/key is missing');
const supabase = createClient(url, key);

const normalize = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const sourceNameAliases = new Map([
  ['vinicius jr', 'vini jr'],
  ['alisson becker', 'alisson'],
]);
const normalizePlayerName = (value) => sourceNameAliases.get(normalize(value)) || normalize(value);
const decode = (value) => value.replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"').trim();
const stripTags = (value) => decode(value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' '));

async function fetchPage(id, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`https://wefut.com/player/25/${id}/sync`, {
        headers: { 'User-Agent': 'fc-squad-builder-data-sync/1.0' },
      });
      if (response.status === 404) return null;
      if (response.status === 429 || response.status >= 500) throw new Error(`HTTP ${response.status}`);
      if (!response.ok) return null;
      const html = await response.text();
      const name = stripTags(html.match(/<h2>([^<]+)<\/h2>/)?.[1] || '');
      const overall = Number(html.match(/<span class="rating"[^>]*>(\d+)<\/span>/)?.[1]);
      if (!name || !overall) return null;

      const traits = html.match(/<div class="traits"[\s\S]*?<h4>PlayStyles<\/h4>([\s\S]*?)<h4>Role Familiarity<\/h4>([\s\S]*?)<\/div>/);
      const playstyles = [];
      for (const match of (traits?.[1] || '').matchAll(/href="[^"]*\/(normal|plus)"[\s\S]*?<img[^>]*alt="([^"]+)"/g)) {
        playstyles.push({ name: decode(match[2]), is_plus: match[1] === 'plus' });
      }
      const roles = [];
      for (const match of (traits?.[2] || '').matchAll(/<span class="badge playstyle-badge">([\s\S]*?)<\/span><\/a>/g)) {
        const text = stripTags(match[1]);
        const roleMatch = text.match(/^([^:]+):\s*(.*?)(\+{1,2})?$/);
        if (roleMatch) roles.push({ position: roleMatch[1].trim(), name: roleMatch[2].trim(), level: roleMatch[3]?.length || 1 });
      }
      return { source_id: id, name, overall, playstyles, roles };
    } catch (error) {
      if (attempt === retries) return null;
      await new Promise((resolve) => setTimeout(resolve, 300 * (2 ** attempt)));
    }
  }
  return null;
}

async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index]);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

const { data: cards, error: cardError } = await supabase
  .from('card_versions')
  .select('id,overall,version,players(name)')
  .eq('version', 'Gold Rare');
if (cardError) throw cardError;

const targets = new Map(cards.map((card) => [`${normalize(card.players?.name)}|${card.overall}`, card]));
console.log(`DB target cards: ${targets.size}`);

const pages = (await mapLimit(Array.from({ length: 600 }, (_, index) => index + 1), 12, fetchPage)).filter(Boolean);
// Some seed rows contain an OVR one point away from EA's base card. Match by
// normalized player name first, then choose the closest public OVR.
const pagesByName = new Map();
for (const page of pages) {
  const key = normalizePlayerName(page.name);
  if (!pagesByName.has(key)) pagesByName.set(key, []);
  pagesByName.get(key).push(page);
}
const matched = cards.flatMap((card) => {
  const candidates = pagesByName.get(normalizePlayerName(card.players?.name)) || [];
  if (!candidates.length) return [];
  const page = candidates.sort((a, b) => Math.abs(a.overall - card.overall) - Math.abs(b.overall - card.overall))[0];
  return [{ page, card }];
});
console.log(`Public pages scanned: ${pages.length}; matched cards: ${matched.length}`);

const { data: playstyleCatalog, error: playstyleError } = await supabase.from('playstyles').select('id,name').order('id');
if (playstyleError) throw playstyleError;
const { data: roleCatalog, error: roleError } = await supabase.from('roles').select('id,position,role_name').order('id');
if (roleError) throw roleError;

const desiredStyleNames = new Set(matched.flatMap(({ page }) => page.playstyles.map((item) => item.name)));
const styleByName = new Map(playstyleCatalog.map((item) => [normalize(item.name), item.id]));
const missingStyleNames = [...desiredStyleNames].filter((name) => !styleByName.has(normalize(name)));
if (missingStyleNames.length) {
  const maxId = Math.max(0, ...playstyleCatalog.map((item) => Number(item.id) || 0));
  const rows = missingStyleNames.map((name, index) => ({ id: maxId + index + 1, name }));
  const { data, error } = await supabase.from('playstyles').upsert(rows, { onConflict: 'id' }).select('id,name');
  if (error) throw error;
  for (const item of data) styleByName.set(normalize(item.name), item.id);
}

const roleByName = new Map(roleCatalog.map((item) => [`${normalize(item.position)}|${normalize(item.role_name)}`, item.id]));
const styleLinks = [];
const roleLinks = [];
for (const { page, card } of matched) {
  for (const item of page.playstyles) {
    const playstyleId = styleByName.get(normalize(item.name));
    if (playstyleId) styleLinks.push({ card_id: card.id, playstyle_id: playstyleId, is_plus: item.is_plus });
  }
  for (const item of page.roles) {
    const roleId = roleByName.get(`${normalize(item.position)}|${normalize(item.name)}`);
    if (roleId) roleLinks.push({ card_id: card.id, role_id: roleId, role_level: item.level });
  }
}

const { data: currentStyles, error: currentStylesError } = await supabase.from('card_playstyles').select('card_id,playstyle_id,is_plus');
if (currentStylesError) throw currentStylesError;
const { data: currentRoles, error: currentRolesError } = await supabase.from('card_roles').select('card_id,role_id,role_level');
if (currentRolesError) throw currentRolesError;
const styleKeys = new Set(currentStyles.map((item) => `${item.card_id}|${item.playstyle_id}`));
const roleKeys = new Set(currentRoles.map((item) => `${item.card_id}|${item.role_id}`));
const newStyles = styleLinks.filter((item) => !styleKeys.has(`${item.card_id}|${item.playstyle_id}`));
const newRoles = roleLinks.filter((item) => !roleKeys.has(`${item.card_id}|${item.role_id}`));

for (let offset = 0; offset < newStyles.length; offset += 250) {
  // Relations are diffed first, keeping bulk insertion idempotent even when
  // the live schema's conflict keys differ from a local schema.
  const { error } = await supabase.from('card_playstyles').insert(newStyles.slice(offset, offset + 250));
  if (error) throw error;
}
for (let offset = 0; offset < newRoles.length; offset += 250) {
  const { error } = await supabase.from('card_roles').insert(newRoles.slice(offset, offset + 250));
  if (error) throw error;
}

const unmatched = cards.filter((card) => !matched.some((item) => item.card.id === card.id));
console.log(JSON.stringify({
  matched: matched.map(({ page, card }) => ({ name: page.name, db_overall: card.overall, source_overall: page.overall, playstyles: page.playstyles.length, roles: page.roles.length })),
  unmatched: unmatched.map((card) => `${card.players?.name} (${card.overall})`),
  inserted: { playstyles: newStyles.length, roles: newRoles.length },
}, null, 2));
