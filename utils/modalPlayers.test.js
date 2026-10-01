import { expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { fetchModalPlayerPage } from './modalPlayers.js';

test('ST default page fetches only 30 detailed cards and more uses the next offset', async () => {
  const requests = [];
  const db = createClient('https://example.supabase.co', 'test', {
    auth: { persistSession: false }, global: { fetch: async url => {
      requests.push(new URL(url));
      return new Response(JSON.stringify([{ id: requests.length }]), { status: 200 });
    } },
  });
  expect(await fetchModalPlayerPage(db, { position: 'ST' })).toHaveLength(1);
  await fetchModalPlayerPage(db, { position: 'ST', offset: 30 });
  expect(requests).toHaveLength(2);
  expect(requests[0].pathname).toBe('/rest/v1/card_versions');
  expect(requests[0].searchParams.get('slot_positions.is_primary')).toBe('eq.true');
  expect(requests[0].searchParams.get('slot_positions.positions.name')).toBe('eq.ST');
  expect(requests[0].searchParams.get('limit')).toBe('30');
  expect(requests[1].searchParams.get('offset')).toBe('30');
  await fetchModalPlayerPage(db, { position: 'ST' });
  expect(requests).toHaveLength(2);
});
