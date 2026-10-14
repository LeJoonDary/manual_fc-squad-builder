import { expect, test } from 'vitest';
import { fitPitchViewport, fitSquadWorkspace } from './pitchViewport.js';
import { FORMATIONS } from './formations.js';

test('every formation fits the viewport without scrollbars and contains its badges and prices', () => {
  for (const [width, height] of [[950, 900], [650, 600], [360, 400], [400, 200]]) {
    for (const formation of FORMATIONS) {
      const fit = fitPitchViewport(width, height, formation.height);
      expect(fit.width * fit.scale).toBeLessThanOrEqual(width + .001);
      expect(fit.fittedHeight).toBeLessThanOrEqual(height + .001);
      expect(fit.fittedHeight).toBe(formation.height * fit.scale);
      expect(fit.scale).toBeGreaterThan(0);
      expect(fit.width).toBe(900);
      expect(fit.scale).toBeLessThanOrEqual(1);
      // Percentage-based fullbacks and wingers keep their entire card inside the touchline.
      for (const slot of formation.slots) {
        const center = slot.x / 100 * (fit.width - 8);
        expect(center - 164 / 2).toBeGreaterThan(0);
        expect(center + 164 / 2).toBeLessThan(fit.width - 8);
      }
      // GK, a full card and its price remain inside the scaled pitch.
      const keeper = formation.slots.find(slot => slot.position === 'GK');
      expect((keeper.y / 100 * (formation.height - 8) + 248 / 2) * fit.scale)
        .toBeLessThan(fit.fittedHeight);
    }
  }
});

test('hidden frames never produce a negative scale', () => {
  expect(fitPitchViewport(0, 0, 1040).scale).toBe(0);
});

test('workspace fills remaining height independently of width from laptop to 4K', () => {
  for (const [width, height] of [[768,432], [1366,768], [1920,1080], [2560,1440], [3840,2160]]) {
    const availableWidth = Math.min(width, 1600) - 48;
    const availableHeight = height - 160;
    for (const header of [60,100,140]) {
      const fit = fitSquadWorkspace(availableWidth, availableHeight, 380, 24, header);
      expect(fit.pitchWidth).toBe(availableWidth - 404);
      expect(fit.pitchHeight).toBe(availableHeight - header);
      expect(fit.pitchHeight + header).toBe(availableHeight);
    }
  }
});

test('narrowing the window changes only pitch width, not height', () => {
  const wide = fitSquadWorkspace(1552, 1100, 380, 24, 90);
  const narrow = fitSquadWorkspace(976, 1100, 380, 24, 90);
  expect(wide.pitchHeight).toBe(1010);
  expect(narrow.pitchHeight).toBe(wide.pitchHeight);
  expect(wide.pitchWidth - narrow.pitchWidth).toBe(576);
});

test('insufficient space never produces negative dimensions', () => {
  expect(fitSquadWorkspace(300, 60, 380, 24, 90)).toEqual({ pitchWidth: 0, pitchHeight: 0, headerHeight: 90 });
});
