import 'dotenv/config';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createDefaultFilters, fetchPlayers } from '../utils/playerFilters.js';
import { matchesPlaystyleFilters } from '../utils/playstyleFilters.js';

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const relation = value => Array.isArray(value) ? value[0] : value;
async function verify(label, filters, check) {
  const rows = await fetchPlayers(db, filters);
  assert(rows.length <= 50);
  assert(rows.every((row, index) => !index || Number(rows[index - 1].overall) >= Number(row.overall)));
  assert(rows.every(check), label);
  console.log(`${label}: ${rows.length} matching cards`);
  return rows;
}
const defaults = await verify('Default overall order', createDefaultFilters(), () => true);
assert(defaults.length > 0);
const { data: later, error } = await db.from('card_versions').select('id,players!inner(name)')
  .order('overall', { ascending: false, nullsFirst: false }).order('id').range(100, 100);
if (error) throw error;
assert(later.length);
const outside = later[0];
const name = relation(outside.players).name;
const names = await verify('Name outside initial 50', { ...createDefaultFilters(), name }, row => {
  const player = relation(row.players);
  return [player.name, player.long_name].some(value => value?.toLowerCase().includes(name.toLowerCase()));
});
assert(names.length > 0);
assert(names.some(row => !defaults.some(original => original.id === row.id)));
const keeper = { ...createDefaultFilters(), positions: new Set(['GK']), onlyPrimary: true, minOvr: 70, minPrice: 0 };
await verify('Primary position plus numeric ranges', keeper, row => row.overall >= 70 && row.price >= 0
  && row.card_positions.some(p => p.is_primary && relation(p.positions).name === 'GK'));
await verify('All selected positions', { ...createDefaultFilters(), positions: new Set(['ST', 'LW']), hasAllPositions: true },
  row => ['ST', 'LW'].every(name => row.card_positions.some(p => relation(p.positions).name === name)));
const styleFilters = { ...createDefaultFilters(), minPlaystyles: 1, maxPlaystylesPlus: 0 };
await verify('PlayStyle count ranges including zero', styleFilters, row => matchesPlaystyleFilters(row.card_playstyles, styleFilters));
const sampleStyle = defaults.flatMap(row => row.card_playstyles).find(row => row.is_plus === true);
assert(sampleStyle);
const specificStyle = { ...createDefaultFilters(), selectedPlayStyles: [{ id: sampleStyle.playstyle_id, level: 'plus' }], requireAllPlaystyles: true };
await verify('Selected PlayStyle+', specificStyle, row => matchesPlaystyleFilters(row.card_playstyles, specificStyle));
const { data: roleSamples, error: roleError } = await db.from('card_roles')
  .select('role_level,roles!inner(position,role_name)').gte('role_level', 1).limit(1);
if (roleError) throw roleError;
if (roleSamples.length) {
const role = relation(roleSamples[0].roles);
const level = Number(roleSamples[0].role_level) === 2 ? 2 : 1;
const roles = { ...createDefaultFilters(), selectedRoles: [{ position: role.position, name: role.role_name, level }], hasAllRoles: true };
const roleCards = await verify('Existing role and level', roles, row => row.card_roles.some(cr => (level === 2 ? cr.role_level === 2 : cr.role_level >= 1)
  && relation(cr.roles).position === role.position && relation(cr.roles).role_name === role.role_name));
assert(roleCards.length > 0);
const impossibleRoles = { ...roles, selectedRoles: [...roles.selectedRoles, { position: 'ST', name: '__missing_role__', level: 2 }] };
assert.equal((await verify('All roles rejects missing role', impossibleRoles, () => false)).length, 0);
await verify('Any role permits existing role', { ...impossibleRoles, hasAllRoles: false }, row => roleCards.some(card => card.id === row.id));
} else {
  console.log('Role positive-match checks skipped: card_roles currently has no rows.');
  assert.equal((await verify('Missing role returns no cards', { ...createDefaultFilters(), selectedRoles: [{ position: 'ST', name: 'Poacher', level: 2 }] }, () => false)).length, 0);
}
const gold = { ...createDefaultFilters(), rarities: new Set(['Gold']), minSm: 3, minWf: 3 };
gold.stats.pac = { min: 70, max: 99 };
await verify('Rarity plus SM/WF and detailed stats', gold, row => /^gold(?: common| rare)?$/i.test(row.version.trim())
  && row.sm >= 3 && row.wf >= 3 && relation(row.player_stats).pac >= 70);
const sample = defaults[0];
await verify('Nation league club intersection', { ...createDefaultFilters(), nation: relation(sample.players).nation_id,
  league: sample.league_id, club: sample.club_id }, row => row.league_id === sample.league_id && row.club_id === sample.club_id
    && relation(row.players).nation_id === relation(sample.players).nation_id);
const empty = await verify('No matches', { ...createDefaultFilters(), name: '__codex_nonexistent_player_987654321__' }, () => false);
assert.equal(empty.length, 0);
const cleared = { ...gold, name: 'previous search' };
Object.assign(cleared, createDefaultFilters());
assert.deepEqual((await verify('Clear all restores defaults', cleared, () => true)).map(row => row.id), defaults.map(row => row.id));
console.log('Live DB filter verification passed.');
