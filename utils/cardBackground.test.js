import { expect, test } from 'vitest';
import { getCardBackground } from './cardBackground.js';

const root = 'https://example.com';
const prefix = `${root}/storage/v1/object/public/card-templates/`;
test.each(['special_sbc', 'special_SBC'])('resolves missing and legacy SBC backgrounds: %s', version => {
  expect(getCardBackground({ version }, root)).toBe(`${prefix}special_ones_to_watch_edited.png`);
  expect(getCardBackground({ raw: { version, background_url: `${prefix}spcial_ones_to_watch_edited.png` } }, root))
    .toBe(`${prefix}special_ones_to_watch_edited.png`);
  expect(getCardBackground({ version, background_url: `${prefix}custom.png` }, root)).toBe(`${prefix}custom.png`);
});
test.each(['special_totw', 'special_base_icon', 'special_debut_international_icon', 'Gold'])('preserves existing DB background: %s', version => {
  expect(getCardBackground({ version, raw: { background_url: `${prefix}existing.png` } }, root)).toBe(`${prefix}existing.png`);
  expect(getCardBackground({ version }, root)).toBe('');
});
