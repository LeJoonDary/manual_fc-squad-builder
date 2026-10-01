import { test, expect } from 'vitest';
import { formatCardVersion, pitchAffiliation, formatSlotPosition } from './pitchCardLabels.js';

test('normalizes directional slot labels without changing football positions', () => {
  for (const [slot, label] of Object.entries({ LCM: 'CM', RCM: 'CM', LS: 'ST', RS: 'ST',
    LCB: 'CB', RCB: 'CB', LDM: 'CDM', RDM: 'CDM', LAM: 'CAM', RAM: 'CAM',
    LB: 'LB', RB: 'RB', LW: 'LW', RW: 'RW', GK: 'GK' })) {
    expect(formatSlotPosition(slot)).toBe(label);
  }
});

test('formats promo slugs and preserves special acronyms', () => {
  for (const [input, output] of Object.entries({
    special_destined_for_glory: 'Destined For Glory', special_squad_foundations: 'Squad Foundations',
    gold_rare: 'Gold Rare', gold_common: 'Gold Common', totw: 'TOTW', icon: 'ICON', hero: 'Hero',
  })) expect(formatCardVersion(input)).toBe(output);
  expect(formatCardVersion(null)).toBe('Standard');
});

test('resolves names from squad objects, raw joins and catalog without missing short names', () => {
  expect(pitchAffiliation({ league: 'La Liga' }, 'league').label).toBe('LALIGA');
  expect(pitchAffiliation({ club: { id: 1, name: 'Real Madrid' } }, 'club').label).toBe('RMA');
  expect(pitchAffiliation({ raw: { clubs: [{ id: 1, name: 'FC Barcelona' }] } }, 'club').label).toBe('FCB');
  expect(pitchAffiliation({ club_id: 1 }, 'club', { clubs: [{ id: 1, name: 'Example', short_name: 'EXC' }] }).label).toBe('EXC');
  expect(pitchAffiliation({ club_id: 112658 }, 'league').label).toBe('ICON');
  expect(pitchAffiliation({ league: 'icons' }, 'league').isIcon).toBe(true);
  expect(pitchAffiliation({}, 'club').label).toBe('');
});
