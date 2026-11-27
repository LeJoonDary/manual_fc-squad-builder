import { test, expect } from 'vitest';
import { applySlotCustom, sanitizeCustom, getEffectivePositions, canMovePitchEntry } from './slotCustom.js';
import { adaptChemistryPlayerCard, calculateChemistry } from './chemistry';
import { readSquadState, writeSquadState } from './squadPersistence.js';
import { FORMATIONS } from './formations.js';
import { getCardFaceStats } from './cardFaceStats.js';
import { generateOptimalSquad } from './autoBuildUtils';
import { normalizeChemistryPosition } from './chemistry';
import { normalizePlaystyles } from './normalizePlaystyles.js';
import { hasCustom } from './slotCustom.js';

test('custom playstyles replace nested originals, survive serialization and reset, including empty selection', () => {
  const base = { ...original, playstyles: [{ name: 'Rapid', is_plus: true }], raw: { players: { playstyles: [{ name: 'Rapid', is_plus: true }] } } };
  const overrides = sanitizeCustom({ playstyles: [
    { playstyle_id: 2, name: 'Finesse Shot', is_plus: false, image_url: 'https://example.com/silver.png' },
    { playstyle_id: 1, name: 'Quick Step', is_plus: true, image_url_plus: 'https://example.com/gold.png' },
  ] });
  const card = applySlotCustom(base, JSON.parse(JSON.stringify(overrides)));
  const styles = normalizePlaystyles(card, card.raw, card.raw.players);
  expect(styles.map(style => style.name)).toEqual(['Quick Step', 'Finesse Shot']);
  expect(styles[0].image_url_plus).toBe('https://example.com/gold.png');
  expect(hasCustom({ playstyles: [] })).toBe(true);
  const cleared = applySlotCustom(base, { playstyles: [] });
  expect(normalizePlaystyles(cleared, cleared.raw, cleared.raw.players)).toEqual([]);
  expect(applySlotCustom(base, {})).toBe(base);
  expect(normalizePlaystyles(base)[0].name).toBe('Rapid');
});

const original = { id: 1, position: 'CM', overall: 80, sm: 3, wf: 3, price: 100, nation_id: 1, club_id: 1, league_id: 1, player_stats: { pac: 70 } };
test('custom stats and added positions preserve original; full chemistry only in valid positions and links stay unchanged', () => {
  const card = applySlotCustom(original, { forceFullChem: true, addedPositions: ['ST'], overall: 95, faceStats: { pac: 99 }, sm: 5 });
  const player = adaptChemistryPlayerCard(card);
  const result = calculateChemistry([{ position: 'LS', player }]);
  expect(result.playerChemMap['1']).toBe(3);
  expect(result.groupCounts.club).toEqual(calculateChemistry([{ position: 'CM', player: adaptChemistryPlayerCard(original) }]).groupCounts.club);
  expect(calculateChemistry([{ position: 'GK', player }]).totalChemistry).toBe(0);
  expect(card.overall).toBe(95); expect(getCardFaceStats(card)[0][1]).toBe(99);
  expect(original.overall).toBe(80); expect(original.player_stats.pac).toBe(70);
  expect(applySlotCustom(original, {})).toBe(original);
});
test('safe storage restores original and overrides, preserves explicit unlocks and rejects corrupt state', () => {
  let stored; const storage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
  const customOverrides = { forceFullChem: true, overall: 95 };
  writeSquadState(storage, { formation: '4-3-1-2', manager: null, budget: 1000, players: { LS: { originalCard: original, card: applySlotCustom(original, customOverrides), customOverrides } } });
  const saved = readSquadState(storage, FORMATIONS);
  expect(saved.players.LS.card.overall).toBe(80);
  expect(saved.players.LS.customOverrides.overall).toBe(95);
  expect(saved.players.LS.isLocked).toBe(false);
  stored = '{'; expect(readSquadState(storage, FORMATIONS)).toBeNull();
  stored = JSON.stringify({ version: 2 }); expect(readSquadState(storage, FORMATIONS)).toBeNull();
  expect(sanitizeCustom({ overall: 200, sm: -1, addedPositions: ['ST','INVALID'], backgroundUrl: 'javascript:alert(1)' })).toEqual({ overall: 99, sm: 1, addedPositions: ['ST'] });
});
test('auto build preserves locked custom raw views, additional positions and full chemistry', async () => {
  const slots = FORMATIONS.find(f => f.name === '4-3-1-2').slots;
  const currentSquad = Object.fromEntries(slots.map((slot, i) => {
    const card = applySlotCustom({ ...original, id: i + 10, player_id: i + 10, nation_id: i + 10, club_id: i + 10, league_id: i + 10 }, {
      addedPositions: [normalizeChemistryPosition(slot.position)], forceFullChem: true, overall: 95,
    });
    return [slot.position, { card, isLocked: true }];
  }));
  const result = await generateOptimalSquad('4-3-1-2', { FW: [], MF: [], DF: [] }, 100000, 33, false, { currentSquad });
  expect(result.success).toBe(true); expect(result.totalChemistry).toBe(33);
  expect(result.squad).toHaveLength(11);
  expect(result.squad.every(player => player.card.overall === 95 && player.card.forceFullChem)).toBe(true);
});

test('pitch moves use all effective positions and require reciprocal compatibility for swaps', () => {
  const entry = { card: { position: 'LB', secondary_positions: ['LM','RB'] }, customOverrides: { addedPositions: ['CAM'] }, isLocked: false };
  const squad = { LB: entry, LCB: null, LM: null, RB: { card: { position: 'RB' } } };
  expect(getEffectivePositions(entry)).toEqual(['LB','LM','RB','CAM']);
  expect(canMovePitchEntry(squad,'LB','LM')).toBe(true);
  expect(canMovePitchEntry(squad,'LB','CAM')).toBe(true);
  expect(canMovePitchEntry(squad,'LB','LCB')).toBe(false);
  expect(canMovePitchEntry(squad,'LB','LB')).toBe(false);
  expect(canMovePitchEntry(squad,'LB','RB')).toBe(false);
  squad.RB.card.secondary_positions = ['LB'];
  expect(canMovePitchEntry(squad,'LB','RB')).toBe(true);
  squad.RB.isLocked = true;
  expect(canMovePitchEntry(squad,'LB','RB')).toBe(false);
  entry.isLocked = true;
  expect(canMovePitchEntry(squad,'LB','LM')).toBe(false);
});
