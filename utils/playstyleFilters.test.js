import { test, expect } from 'vitest';
import { matchesPlaystyleFilters, fetchPlaystyleOptions } from './playstyleFilters.js';
import { createClient } from '@supabase/supabase-js';

test('loads icon metadata and excludes NULL normal icons in the database query', async () => {
  const urls = [];
  const db = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async url => {
      urls.push(new URL(url));
      return new Response(JSON.stringify(urls.length === 1
        ? [{ id: 7, name: 'Finesse Shot', category: 'Shooting', image_url: '/normal.png', image_url_plus: '/plus.png' }]
        : []), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const options = await fetchPlaystyleOptions(db);
  expect(options[0].image_url_plus).toBe('/plus.png');
  expect(urls[0].searchParams.get('image_url')).toBe('not.is.null');
  expect(urls[0].searchParams.get('image_url_plus')).toBe('not.is.null');
  expect(urls[0].searchParams.get('select')).toBe('id,name,image_url,image_url_plus,category');
});

const rows = [{ playstyle_id: 35, is_plus: false }, { playstyle_id: 36, is_plus: true }];
test('matches exact Normal/Plus master IDs with OR and AND', () => {
  const normal = { id: 35, level: 'normal' };
  const plus = { id: 36, level: 'plus' };
  expect(matchesPlaystyleFilters(rows, { selectedPlayStyles: [normal, plus], requireAllPlaystyles: true })).toBe(true);
  const wrongLevel = { id: 35, level: 'plus' };
  expect(matchesPlaystyleFilters(rows, { selectedPlayStyles: [wrongLevel] })).toBe(false);
  expect(matchesPlaystyleFilters(rows, { selectedPlayStyles: [normal, wrongLevel] })).toBe(true);
  expect(matchesPlaystyleFilters(rows, { selectedPlayStyles: [normal, wrongLevel], requireAllPlaystyles: true })).toBe(false);
});
test('applies inclusive, separate count ranges and zero maximums', () => {
  expect(matchesPlaystyleFilters(rows, { minPlaystyles: 1, maxPlaystyles: 1, minPlaystylesPlus: 1, maxPlaystylesPlus: 1 })).toBe(true);
  expect(matchesPlaystyleFilters(rows, { maxPlaystylesPlus: 0 })).toBe(false);
  expect(matchesPlaystyleFilters(rows, { minPlaystyles: 2 })).toBe(false);
  expect(matchesPlaystyleFilters([], { maxPlaystyles: 0, maxPlaystylesPlus: 0 })).toBe(true);
  expect(matchesPlaystyleFilters([...rows, ...rows], { maxPlaystyles: 1, maxPlaystylesPlus: 1 })).toBe(true);
});
