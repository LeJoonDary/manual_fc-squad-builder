import { expect, test } from 'vitest';
import { applyPhysicalQuery, matchesPhysicalTypes, BODY_TYPE_VALUES } from './physicalFilters.js';
test('Controlled excludes mixed types while keyword selections include them', () => {
  const match = (value, types) => matchesPhysicalTypes({ accele_type: value }, new Set(types), new Set());
  expect(match('Controlled', ['Controlled'])).toBe(true);
  expect(match('Controlled Explosive', ['Controlled'])).toBe(false);
  expect(match('Controlled Lengthy', ['Controlled'])).toBe(false);
  expect(match('mostly explosive', ['Explosive'])).toBe(true);
  expect(match('Controlled Lengthy', ['Lengthy'])).toBe(true);
  expect(match('Mostly Lengthy', ['Controlled', 'Explosive'])).toBe(false);
});
test('body options match exact database values', () => {
  expect(Object.keys(BODY_TYPE_VALUES)).toHaveLength(10);
  for (const [label, value] of Object.entries(BODY_TYPE_VALUES)) expect(matchesPhysicalTypes({ body_type: value }, new Set(), new Set([label]))).toBe(true);
  expect(BODY_TYPE_VALUES['Lean Medium']).toBe('Lean');
  expect(BODY_TYPE_VALUES['Average Medium']).toBe('Average');
  expect(BODY_TYPE_VALUES['Stocky Medium']).toBe('Stocky');
});
test('query uses exact, partial, and OR conditions with mapped body values', () => {
  const calls = [];
  const query = Object.fromEntries(['eq', 'ilike', 'or', 'in'].map(method => [method, (...args) => { calls.push([method, ...args]); return query; }]));
  applyPhysicalQuery(query, new Set(['Controlled']), new Set(['Lean Medium']));
  applyPhysicalQuery(query, new Set(['Explosive']), new Set());
  applyPhysicalQuery(query, new Set(['Controlled', 'Lengthy']), new Set());
  expect(calls).toEqual([['eq', 'accele_type', 'Controlled'], ['in', 'body_type', ['Lean']], ['ilike', 'accele_type', '%Explosive%'], ['or', 'accele_type.eq.Controlled,accele_type.ilike.%Lengthy%']]);
});
