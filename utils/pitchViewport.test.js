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

test('desktop workspace fits laptop, FHD, QHD and 4K with matching sidebar height', () => {
  for (const [screenWidth, screenHeight] of [[1024, 600], [1366, 768], [1920, 1080], [2560, 1440], [3840, 2160]]) {
    const sidebar = screenWidth >= 1536 ? 440 : screenWidth >= 1280 ? 400 : 360;
    const gap = screenWidth >= 1280 ? 32 : 20, cap = 1600;
    const width = Math.min(screenWidth - 48, 1920);
    const height = screenHeight - 80 - 24;
    for (const header of [60, 100, 140]) {
      const fit = fitSquadWorkspace(width, height, sidebar, gap, header, cap);
      expect(fit.pitchWidth + sidebar + gap).toBeLessThanOrEqual(width);
      expect(fit.pitchHeight + header).toBeLessThanOrEqual(height);
      expect(fit.pitchHeight).toBeLessThanOrEqual(cap);
      expect(fit.pitchWidth / fit.pitchHeight).toBeCloseTo(4 / 5);
    }
  }
});

test('QHD and 4K use the available height and scale all formation artwork and cards together', () => {
  for (const [screenHeight, expectedHeight] of [[1440, 1246], [2160, 1600]]) {
    const layout = fitSquadWorkspace(1920, screenHeight - 104, 440, 32, 90);
    expect(layout.pitchHeight).toBe(expectedHeight);
    expect(layout.pitchWidth).toBeCloseTo(expectedHeight * .8);
    for (const formation of FORMATIONS) {
      const fit = fitPitchViewport(layout.pitchWidth, layout.pitchHeight, formation.height);
      expect(fit.fittedHeight).toBeLessThanOrEqual(layout.pitchHeight + .001);
      expect(fit.scale).toBeGreaterThan(0);
      const laptop = fitPitchViewport(480, 600, formation.height);
      expect(fit.scale).toBeGreaterThan(laptop.scale);
    }
  }
  expect(fitPitchViewport(1008, 1260, 1125).scale).toBeGreaterThan(1);
});

test('pitch shrinks continuously only after the margins are exhausted', () => {
  for (let width = 1144; width > 1024; width--) {
    const previous = fitSquadWorkspace(width - 48, 1100, 380, 28, 90);
    const next = fitSquadWorkspace(width - 49, 1100, 380, 28, 90);
    expect(previous.pitchWidth - next.pitchWidth).toBeCloseTo(1);
    expect(previous.pitchHeight - next.pitchHeight).toBeCloseTo(1.25);
  }
});
