import { expect, test } from 'vitest';
import { FORMATIONS } from './formations.js';
import { generateOptimalSquad, getNormalizedSquadArray, getRemainingAutoBuildBudget } from './autoBuildUtils';

const slots = FORMATIONS.find(f => f.name === '4-3-1-2')!.slots;
const locked = (price = 197000) => ({ card: { id: 999, player_id: 999, name: 'Pedri', position: 'CM',
  price, overall: 90, nationId: 2, leagueId: 2, clubId: 2,
  pac: 90, sho: 90, pas: 90, dri: 90, def: 90, phy: 90 }, isLocked: true, isOwned: false });

test.each([197000, 52000])('counts the central CM lock once at %i coins', price => {
  const entry = locked(price);
  const currentSquad = { CM: entry };
  const normalized = getNormalizedSquadArray(currentSquad, 11, slots);
  expect(normalized.filter(Boolean)).toEqual([entry]);
  expect(normalized[4]).toBe(entry);
  expect(normalized[3]).toBeNull();
  expect(normalized[5]).toBeNull();
  expect(getRemainingAutoBuildBudget(500000, '4-3-1-2', { currentSquad }).lockedCost).toBe(price);
});

test('keeps exact and indexed empty slots authoritative and refuses ambiguous aliases', () => {
  const entry = locked();
  expect(getNormalizedSquadArray({ CM: entry, 4: null }, 11, slots).filter(Boolean)).toEqual([]);
  expect(getNormalizedSquadArray({ ST: entry }, 11, slots).filter(Boolean)).toEqual([]);
  expect(getNormalizedSquadArray({ LS: null, ST: entry }, 11, slots)[1]).toBe(entry);
  expect(getNormalizedSquadArray({ LCM: entry }, 11, slots).filter(Boolean)).toEqual([entry]);
});

test.each(['CM', 'index'])('builds eleven players with one central lock via %s identity', async shape => {
  const entry = locked();
  const currentSquad = shape === 'CM' ? { CM: entry } : slots.map((_, i) => i === 4 ? entry : null);
  const cards = slots.flatMap((slot, i) => i === 4 ? [] : [{ id: i + 1, player_id: i + 1,
    position: slot.position, overall: 90, price: 1000, nationId: Math.floor(i / 4) + 1,
    clubId: Math.floor(i / 4) + 1, leagueId: Math.floor(i / 4) + 1,
    pac: 90, sho: 90, pas: 90, dri: 90, def: 90, phy: 90 }]);
  const result = await generateOptimalSquad('4-3-1-2', { FW: cards, MF: cards, DF: cards }, 500000, 33, true, { currentSquad });
  expect(result.success).toBe(true);
  expect(result.squad).toHaveLength(11);
  expect(result.squad.filter(p => p.isLocked)).toHaveLength(1);
  expect(result.squad[4].id).toBe('999');
  expect(result.totalCost).toBe(207000);
});
