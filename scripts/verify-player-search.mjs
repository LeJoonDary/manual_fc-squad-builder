import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { JSDOM } from 'jsdom';
import { createPlayerCard } from '../components/PlayerCard.js';
import { createPlaystyleIcons } from '../components/PlaystyleIcons.js';

import { fetchPlayers, createDefaultFilters } from '../utils/playerFilters.js';
import { fetchModalPlayerPage } from '../utils/modalPlayers.js';

dotenv.config({ quiet: true });
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const one = value => Array.isArray(value) ? value[0] : value;
const dom = new JSDOM('<!doctype html><body></body>');
globalThis.document = dom.window.document;
globalThis.window = dom.window;
function verifyCardUI(row) {
  const stats = one(row.player_stats);
  const card = { ...row, raw: row, name: one(row.players)?.name, summary_only: true,
    primary_position: one(row.card_positions.find(position => position.is_primary)?.positions)?.name };
  const node = createPlayerCard(card, {
    onActivate: () => {}, getCardName: value => value.name, getCardRating: value => value.overall,
    getCardPosition: value => value.primary_position, affiliationCatalog: {}, unwrapRelation: one,
    createPlaystyleBadges: (value, limit, className) => createPlaystyleIcons(value.card_playstyles.map(style => ({
      ...one(style.playstyles), isPlus: style.is_plus,
    })), className),
  });
  const labels = [...node.querySelectorAll('.browser-player-stat-label')].map(item => item.textContent);
  const values = [...node.querySelectorAll('.browser-player-stat-value')].map(item => item.textContent);
  if (labels.join(',') !== 'PAC,SHO,PAS,DRI,DEF,PHY' || values.join(',') !== ['pac','sho','pas','dri','def','phy'].map(key => stats[key]).join(',')) {
    throw new Error(`Card ${row.id}: face stat UI mismatch`);
  }
  const skills = node.querySelector('.browser-player-foot-skills')?.textContent;
  if (!skills?.includes(`SM ${row.sm}`) || !skills.includes(`WF ${row.wf}`) || !skills.includes(`Foot: ${row.preferred_foot}`)) {
    throw new Error(`Card ${row.id}: foot/skills UI missing`);
  }
  const roles = node.querySelectorAll('.browser-player-elite-roles > span');
  if (roles.length > 2 || (row.card_roles.length > 0 && roles.length === 0)) throw new Error(`Card ${row.id}: role UI mismatch`);
  const expectedIcons = row.card_playstyles.filter(style => one(style.playstyles)?.[style.is_plus ? 'image_url_plus' : 'image_url']).length;
  if (node.querySelectorAll('.playstyle-icon').length !== expectedIcons) throw new Error(`Card ${row.id}: playstyle UI mismatch`);
  if (node.querySelector('img:not(.playstyle-icon img):not(.browser-player-flag)')) throw new Error(`Card ${row.id}: unexpected portrait`);
}
async function check(label, fetchRows) {
  const start = performance.now();
  const rows = await fetchRows();
  const ms = Math.round(performance.now() - start);
  if (!rows.length) throw new Error(`${label}: no results`);
  const invalid = rows.filter(row => {
    const stats = one(row.player_stats);
    return !stats || ['pac','sho','pas','dri','def','phy'].some(key => stats[key] == null)
      || !Array.isArray(row.card_roles) || !Array.isArray(row.card_playstyles)
      || row.sm == null || row.wf == null || !row.preferred_foot;
  });
  if (invalid.length) throw new Error(`${label}: ${invalid.length} cards missing required data`);
  rows.forEach(verifyCardUI);
  console.log(JSON.stringify({ label, ms, under500ms: ms < 500, rows: rows.length,
    cardUI: 'passed',
    roles: rows.reduce((n, row) => n + row.card_roles.length, 0),
    playstyles: rows.reduce((n, row) => n + row.card_playstyles.length, 0),
    sample: { id: rows[0].id, name: one(rows[0].players)?.name, stats: one(rows[0].player_stats),
      foot: rows[0].preferred_foot, sm: rows[0].sm, wf: rows[0].wf } }));
}
try {
  await check('Players initial page (cold)', () => fetchPlayers(db, createDefaultFilters(), AbortSignal.timeout(15000)));
  await check('ST initial page (cold)', () => fetchModalPlayerPage(db, { position: 'ST', signal: AbortSignal.timeout(15000) }));
  for (const keyword of ['gross', 'mbappe']) {
    await check(`Players ${keyword}`, () => fetchPlayers(db, { ...createDefaultFilters(), name: keyword }, AbortSignal.timeout(15000)));
  }
  await check('ST mbappe', () => fetchModalPlayerPage(db, { position: 'ST', keyword: 'mbappe', signal: AbortSignal.timeout(15000) }));
  await check('Players mbappe cached', () => fetchPlayers(db, { ...createDefaultFilters(), name: 'mbappe' }, AbortSignal.timeout(15000)));
} catch (error) {
  console.error(JSON.stringify({ error: error.message }));
  process.exitCode = 1;
}
