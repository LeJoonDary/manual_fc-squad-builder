
import { expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { matchesSlotRequirements, fetchCandidatePlayers, calculateMetaPaceScore, evaluateCardScoreWithRequirements } from './autoBuildUtils';

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
it.each([{ isPlus: false, minLevel: 1 as const }, { isPlus: true, minLevel: 1 as const }, { isPlus: false, minLevel: 2 as const }, { isPlus: true, minLevel: 2 as const }])('applies minimum tier predicates before DB limit %j', async ({ isPlus, minLevel }) => {
  const urls: URL[] = [];
  const db = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async url => { urls.push(new URL(String(url))); return new Response('[]', { headers: { 'Content-Type': 'application/json' } }); } },
  });
  await fetchCandidatePlayers(1000000, '4-3-3', false, db, { slotRequirements: {
    LCM: { role: { name: 'Holding', minLevel }, playstyle: { idOrName: 'Intercept', isPlus } },
  } });
  const query = urls.find(url => url.searchParams.has('required_styles.playstyles.name'))!.searchParams;
  expect(query.get('required_styles.playstyles.name')).toBe('eq.Intercept');
  expect(query.get('required_roles.roles.role_name')).toBe('eq.Holding');
  expect(query.get('required_roles.role_level')).toBe(`gte.${minLevel}`);
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

it('includes gold in either alias even when the other alias is an empty array', () => {
  const card = { playstyles_plus: [], playstylesPlus: [{ id: 7 }] };
  expect(matchesSlotRequirements(card, { playstyle: { idOrName: 7, isPlus: false } })).toBe(true);
  expect(matchesSlotRequirements(card, { playstyle: { idOrName: 7, isPlus: true } })).toBe(true);
});
it('accepts joined Role++ for Role+ and rejects lower tiers or wrong roles', () => {
  const card = { card_roles: [{ role_level: 2, roles: { position: 'ST', role_name: 'Poacher' } }] };
  expect(matchesSlotRequirements(card, { role: { name: 'Poacher', minLevel: 1 } }, 'ST')).toBe(true);
  expect(matchesSlotRequirements(card, { role: { name: 'Poacher', minLevel: 2 } }, 'ST')).toBe(true);
  expect(matchesSlotRequirements(card, { role: { name: 'Target Forward', minLevel: 1 } }, 'ST')).toBe(false);
});

it('requires every selected style and scores requested gold and Role++ above lower tiers', () => {
  const req = { role: { name: 'Poacher', minLevel: 1 as const }, playstyles: [
    { id: 7, name: 'Technical', isPlus: false }, { id: 9, name: 'Intercept', isPlus: true },
  ] };
  const lower = { roles: [{ name: 'Poacher', level: 1 }], playstyles: [7], playstyles_plus: [9] };
  const higher = { roles: [{ name: 'Poacher', level: 2 }], playstyles_plus: [7, 9] };
  expect(matchesSlotRequirements(lower, req, 'ST')).toBe(true);
  expect(matchesSlotRequirements(higher, req, 'ST')).toBe(true);
  expect(matchesSlotRequirements({ ...lower, playstyles: [] }, req, 'ST')).toBe(false);
  expect(matchesSlotRequirements({ ...lower, playstyles: [7, 9], playstyles_plus: [] }, req, 'ST')).toBe(false);
  expect(evaluateCardScoreWithRequirements(higher, 'ST', req) - evaluateCardScoreWithRequirements(lower, 'ST', req)).toBeCloseTo(3.5);
  expect(evaluateCardScoreWithRequirements(higher, 'ST', req) - calculateMetaPaceScore(higher, 'ST')).toBeCloseTo(12);
});
it('queries all requested styles with independent joins before the candidate limit', async () => {
  const urls: URL[] = [];
  const db = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async url => { urls.push(new URL(String(url))); return new Response('[]', { headers: { 'Content-Type': 'application/json' } }); } },
  });
  await fetchCandidatePlayers(1000000, '4-3-3', false, db, { slotRequirements: { ST: { playstyles: [
    { id: 7, name: 'Technical', isPlus: false }, { id: 9, name: 'Intercept', isPlus: true },
  ] } } });
  const query = urls.find(url => url.searchParams.has('required_styles_1.playstyles.id'))!.searchParams;
  expect(query.get('required_styles.playstyles.id')).toBe('eq.7');
  expect(query.get('required_styles.is_plus')).toBeNull();
  expect(query.get('required_styles_1.playstyles.id')).toBe('eq.9');
  expect(query.get('required_styles_1.is_plus')).toBe('eq.true');
  expect(query.get('select')).toContain('required_styles_1:card_playstyles!inner');
});

it('uses OR across roles, AND across styles, and caps the best-role-plus-styles bonus', () => {
  const req = { roles: [{ name: 'Poacher', minLevel: 2 as const }, { name: 'Target Forward', minLevel: 1 as const }],
    playstyles: [7, 9, 10].map(id => ({ id, name: String(id), isPlus: false })) };
  const card = { roles: [{ name: 'Target Forward', level: 1 }], playstyles: [7, 9, 10] };
  expect(matchesSlotRequirements(card, req, 'ST')).toBe(true);
  expect(matchesSlotRequirements({ ...card, roles: [{ name: 'Poacher', level: 1 }] }, req, 'ST')).toBe(false);
  expect(matchesSlotRequirements({ ...card, playstyles: [7, 9] }, req, 'ST')).toBe(false);
  expect(evaluateCardScoreWithRequirements(card, 'ST', req) - calculateMetaPaceScore(card, 'ST')).toBeCloseTo(8.5);
  const elite = { roles: [{ name: 'Poacher', level: 2 }, { name: 'Target Forward', level: 2 }], playstyles_plus: [7, 9, 10] };
  expect(evaluateCardScoreWithRequirements(elite, 'ST', req) - calculateMetaPaceScore(elite, 'ST')).toBeCloseTo(12);
  expect(evaluateCardScoreWithRequirements(elite, 'ST', { roles: req.roles }) - calculateMetaPaceScore(elite, 'ST')).toBeCloseTo(5);
});
it('queries each alternative role at its own minimum while keeping all style predicates', async () => {
  const urls: URL[] = [];
  const db = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async url => { urls.push(new URL(String(url))); return new Response('[]', { headers: { 'Content-Type': 'application/json' } }); } },
  });
  await fetchCandidatePlayers(1000000, '4-3-3', false, db, { slotRequirements: { ST: {
    roles: [{ name: 'Poacher', minLevel: 2 }, { name: 'Target Forward', minLevel: 1 }],
    playstyles: [{ id: 7, name: 'Technical', isPlus: true }],
  } } });
  const queries = urls.filter(url => url.searchParams.has('required_roles.roles.role_name')).map(url => url.searchParams);
  expect(queries.map(q => [q.get('required_roles.roles.role_name'), q.get('required_roles.role_level')])).toEqual([
    ['eq.Poacher', 'gte.2'], ['eq.Target Forward', 'gte.1'],
  ]);
  expect(queries.every(q => q.get('required_styles.playstyles.id') === 'eq.7' && q.get('required_styles.is_plus') === 'eq.true')).toBe(true);
});
