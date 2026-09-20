import { expect, test } from 'vitest';
import { applyPhysicalQuery, matchesPhysicalTypes } from './physicalFilters.js';
test('Controlled excludes mixed types while keyword selections include them', () => {
  const match = (value, types) => matchesPhysicalTypes({ accele_type: value }, new Set(types), new Set());
  expect(match('Controlled', ['Controlled'])).toBe(true);
  expect(match('Controlled Explosive', ['Controlled'])).toBe(false);
  expect(match('Controlled Lengthy', ['Controlled'])).toBe(false);
  expect(match('mostly explosive', ['Explosive'])).toBe(true);
  expect(match('Controlled Lengthy', ['Lengthy'])).toBe(true);
  expect(match('Mostly Lengthy', ['Controlled', 'Explosive'])).toBe(false);
});
test('body options match UI labels exactly without legacy conversion', () => {
  for (const value of ['Lean Short', 'Lean Medium', 'Lean Tall', 'Average Short',
    'Average Medium', 'Average Tall', 'Stocky Short', 'Stocky Medium', 'Stocky Tall', 'Unique']) {
    expect(matchesPhysicalTypes({ body_type: value }, new Set(), new Set([value]))).toBe(true);
  }
  for (const value of ['Lean', 'Lean (170-185)', 'lean medium', 'Lean Medium ']) {
    expect(matchesPhysicalTypes({ body_type: value }, new Set(), new Set(['Lean Medium']))).toBe(false);
  }
});

test('query uses exact, partial, and OR conditions with unchanged body values', () => {
  const calls = [];
  const query = Object.fromEntries(['eq', 'ilike', 'or', 'in'].map(method => [method, (...args) => { calls.push([method, ...args]); return query; }]));
  applyPhysicalQuery(query, new Set(['Controlled']), new Set(['Lean Medium']));
  applyPhysicalQuery(query, new Set(['Explosive']), new Set());
  applyPhysicalQuery(query, new Set(['Controlled', 'Lengthy']), new Set());
  expect(calls).toEqual([['eq', 'accele_type', 'Controlled'], ['eq', 'body_type', 'Lean Medium'], ['ilike', 'accele_type', '%Explosive%'], ['or', 'accele_type.eq.Controlled,accele_type.ilike.%Lengthy%']]);
});

test('multiple body types use exact IN matches without conversion', () => {
  const calls = [];
  const query = { in: (...args) => { calls.push(args); return query; } };
  applyPhysicalQuery(query, new Set(), new Set(['Average Short', 'Stocky Medium']));
  expect(calls).toEqual([['body_type', ['Average Short', 'Stocky Medium']]]);
});
