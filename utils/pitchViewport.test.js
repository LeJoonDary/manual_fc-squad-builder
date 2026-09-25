import { expect, test } from 'vitest';
import { fitPitchViewport } from './pitchViewport.js';
import { FORMATIONS } from './formations.js';

test('every formation fits both available dimensions without distorting its aspect ratio', () => {
  for (const [width, height] of [[950, 900], [650, 600], [360, 400], [400, 200]]) {
    for (const formation of FORMATIONS) {
      const fit = fitPitchViewport(width, height, formation.height);
      expect(fit.width * fit.scale).toBeLessThanOrEqual(width + 0.001);
      expect(fit.fittedHeight).toBeLessThanOrEqual(height + 0.001);
      expect(fit.scale).toBeGreaterThan(0);
      expect(fit.width / formation.height).toBeCloseTo(5 / 6);
      // Percentage-based fullbacks and wingers keep their entire card inside the touchline.
      for (const slot of formation.slots) {
        const center = slot.x / 100 * (fit.width - 8);
        expect(center - 136 / 2).toBeGreaterThan(0);
        expect(center + 136 / 2).toBeLessThan(fit.width - 8);
      }
      // GK, a full card and its price remain inside the scaled pitch.
      const keeper = formation.slots.find(slot => slot.position === 'GK');
      expect((keeper.y / 100 * (formation.height - 8) + 224) * fit.scale)
        .toBeLessThan(fit.fittedHeight);
    }
  }
});

test('hidden frames never produce a negative scale', () => {
  expect(fitPitchViewport(0, 0, 1040).scale).toBe(0);
});
