
import { expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { matchesSlotRequirements, fetchCandidatePlayers, calculateMetaPaceScore } from './autoBuildUtils';

it.each([1, 2])('accepts Role+ minimum without adding points at actual level %s', level => {
  const card = { overall: 85, roles: [{ name: 'Poacher', position: 'ST', level }] };
  const req = { role: { name: 'Poacher', minLevel: 1 as const } };
  expect(matchesSlotRequirements(card, req, 'ST')).toBe(true);
  expect(matchesSlotRequirements(card, { role: { name: 'Poacher', minLevel: 2 } }, 'ST')).toBe(level === 2);
  expect(matchesSlotRequirements(card, req, 'CM')).toBe(false);
  expect(calculateMetaPaceScore(card, 'ST', { slotRequirements: { ST: req } })).toBe(calculateMetaPaceScore(card, 'ST'));
});
it.each([
  { playstyles: [7] }, { playstyles: [{ id: 7, name: 'Technical' }] },
  { playstyles_plus: [7] }, { playstylesPlus: [{ id: '7' }] },
  { card_playstyles: [{ playstyle_id: 7, is_plus: false, playstyles: { name: 'Technical' } }] },
  { raw: { card_playstyles: [{ playstyle_id: 7, is_plus: true, playstyles: [{ name: 'Technical' }] }] } },
])('accepts silver or higher across supported shapes %j', card => {
  expect(matchesSlotRequirements(card, { playstyle: { idOrName: 7, isPlus: false } }, 'ST')).toBe(true);
});
it('requires both role and gold, rejecting silver-only and different styles', () => {
  const req = { role: { name: 'Poacher', minLevel: 2 as const }, playstyle: { idOrName: 'Technical', isPlus: true } };
  const card = { roles: [{ name: 'Poacher', level: 2 }], playstyles: ['Technical'] };
  expect(matchesSlotRequirements(card, req, 'ST')).toBe(false);
  expect(matchesSlotRequirements({ ...card, playstyles_plus: ['Technical'] }, req, 'ST')).toBe(true);
  expect(matchesSlotRequirements({ ...card, roles: [], playstyles_plus: ['Technical'] }, req, 'ST')).toBe(false);
  expect(matchesSlotRequirements({ ...card, playstyles_plus: ['Rapid'] }, req, 'ST')).toBe(false);
});
it.each([false, true])('applies combined role and playstyle predicates before DB limit (plus %s)', async isPlus => {
  const urls: URL[] = [];
  const db = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async url => { urls.push(new URL(String(url))); return new Response('[]', { headers: { 'Content-Type': 'application/json' } }); } },
  });
  await fetchCandidatePlayers(1000000, '4-3-3', false, db, { slotRequirements: {
    LCM: { role: { name: 'Holding', minLevel: 2 }, playstyle: { idOrName: 'Intercept', isPlus } },
  } });
  const query = urls.find(url => url.searchParams.has('required_styles.playstyles.name'))!.searchParams;
  expect(query.get('required_styles.playstyles.name')).toBe('eq.Intercept');
  expect(query.get('required_roles.roles.role_name')).toBe('eq.Holding');
  expect(query.get('required_roles.role_level')).toBe('gte.2');
  expect(query.get('required_styles.is_plus')).toBe(isPlus ? 'eq.true' : null);
  expect(query.get('limit')).toBe('120');
});
it.each([{ gender: 'Female' }, { gender: 0 }, { isWomen: true }, { playerDef: { isWomen: true } }, { players: [{ gender: 'F' }] }])(
  'applies only the female penalty at known tall height %j', gender => {
    const base = { overall: 85, height: 190, face_stats: { pac: 80, def: 80, phy: 80 } };
    expect(calculateMetaPaceScore({ ...base, ...gender }, 'CB')).toBe(calculateMetaPaceScore(base, 'CB') - 25);
    expect(calculateMetaPaceScore({ ...base, ...gender }, 'GK')).toBe(60);
    expect(calculateMetaPaceScore({ ...base, gender: 'Male' }, 'CB')).toBe(calculateMetaPaceScore(base, 'CB'));
  });
