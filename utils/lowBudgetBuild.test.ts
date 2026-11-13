import { afterEach, expect, test, vi } from 'vitest';
import { calculateSquadChemistry, generateOptimalSquad } from './autoBuildUtils';
import fixture from '../scripts/mocks/strikerAnchorCandidates.json';
afterEach(() => vi.restoreAllMocks());

test('finishes an empty 100k squad in the main first stage with a coherent affordable core', async () => {
  // Keep the existing search-efficiency baseline independent of random jitter.
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  const result = await generateOptimalSquad('4-3-1-2', fixture.candidates as any, 100000, 33, true,
    { excludeZeroPriceCards: true });
  expect(result.success).toBe(true);
  expect(result.totalChemistry).toBe(33);
  expect(result.totalCost).toBeLessThanOrEqual(100000);
  expect(result.searchStage).toBe(1);
  expect(result.iterations).toBeLessThan(50);
  expect(result.squad).toHaveLength(11);
  expect(result.squad.every(p => !p.isLocked && p.price > 0)).toBe(true);
  expect(calculateSquadChemistry(result.squad, true).totalChemistry).toBe(33);
});
