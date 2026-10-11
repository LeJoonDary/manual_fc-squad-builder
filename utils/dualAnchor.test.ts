import { expect, test } from 'vitest';
import { anchorSynergyScore, evaluatePartialSquadCohesion, selectDynamicAnchor, getDynamicCandidatesForSlot,
  generateOptimalSquad, getPositionBudgetGroup } from './autoBuildUtils';
import { FORMATIONS } from './formations.js';

const make = (id: string, position: string, clubId: number, leagueId: number, nationId: number) => ({
  id, playerKey: id, position, slotPosition: position, clubId, leagueId, nationId,
  metaScore: 90, price: 1000, card: { overall: 85 }, isIcon: false, isHero: false,
});

test.each([['clubId', 3, 18], ['leagueId', 5, 12], ['nationId', 4, 8]] as const)(
  '%s bonus stops at saturation %s', (field, cap, bonus) => {
    const candidate = { [field]: 1 } as any;
    for (let count = 0; count <= cap + 2; count++) {
      expect(anchorSynergyScore(candidate, Array.from({ length: count }, () => ({ [field]: '1' })) as any))
        .toBe(count > 0 && count < cap ? bonus : 0);
    }
  });

test('raw joins, locked cards and special-card identities share saturation rules', () => {
  const raw = { club: { id: 1 }, league: { id: 100 }, nation: { id: 2 } };
  expect(anchorSynergyScore(raw as any, [{ ...raw, isLocked: true }] as any)).toBe(38);
  expect(anchorSynergyScore({ isIcon: true, clubId: 1, leagueId: 100, nationId: 2 } as any,
    [{ clubId: 1, leagueId: 100, nationId: 2 }] as any)).toBe(8);
  expect(anchorSynergyScore({} as any, [{}] as any)).toBe(0);
});

test('saturated primary hands candidate ranking to an under-chemistry second ace', () => {
  const squad = [make('a', 'ST', 1, 100, 1), make('b', 'LW', 1, 100, 1), make('c', 'RW', 1, 100, 1),
    make('second', 'CAM', 2, 101, 2)];
  expect(selectDynamicAnchor(squad.slice(0, 2))).toBeNull();
  expect(selectDynamicAnchor(squad)?.id).toBe('second');
  const oldLink = make('old', 'CM', 1, 100, 1);
  const newLink = make('new', 'CM', 2, 101, 2);
  expect(getDynamicCandidatesForSlot('CM', squad, [oldLink, newLink], 10000)[0].id).toBe('new');
  expect(squad.map(p => p.id)).toEqual(['a', 'b', 'c', 'second']);
});

test('league saturation alone switches anchors and manual priorities determine the next ace', () => {
  const squad = [make('st', 'ST', 1, 100, 1), make('wing', 'LW', 2, 100, 2),
    make('mid', 'CM', 3, 100, 3), make('back', 'LB', 4, 100, 4), make('keeper', 'GK', 5, 100, 5),
    make('cam', 'CAM', 6, 101, 6), make('cb', 'CB', 7, 102, 7)];
  expect(selectDynamicAnchor(squad, false, ['ST', 'CB', 'CAM'])?.id).toBe('cb');
});

test('fully chemistried teammates are not chosen as the secondary anchor', () => {
  const squad = [make('st', 'ST', 1, 100, 1), make('cam', 'CAM', 1, 100, 1),
    make('cm', 'CM', 1, 100, 1), make('cb', 'CB', 1, 100, 1)];
  expect(selectDynamicAnchor(squad)).toBeNull();
});

test('partial-squad affiliation rewards plateau instead of stacking after saturation', () => {
  const players = Array.from({ length: 8 }, (_, i) => make(String(i), 'ST', 1, 100, 1));
  expect(evaluatePartialSquadCohesion(players.slice(0, 5))).toBe(2 * 18 + 4 * 12 + 3 * 8);
  expect(evaluatePartialSquadCohesion(players)).toBe(evaluatePartialSquadCohesion(players.slice(0, 5)));
});

test('5-5 league hybrid plus an Icon completes 33 chemistry within budget', async () => {
  const slots = FORMATIONS.find(f => f.name === '4-3-1-2')!.slots;
  const groups = { FW: [], MF: [], DF: [] } as Record<string, any[]>;
  slots.forEach((slot, i) => {
    const side = i < 5 ? 0 : 1;
    groups[getPositionBudgetGroup(slot.position, false)].push({ id: i, player_id: i, position: slot.position,
      overall: 85, price: 40000, pac: 90, phy: 80, def: 80,
      nationId: side + 1, leagueId: 100 + side, clubId: side * 10 + (i % 5 < 3 ? 1 : 2),
      ...(i === 10 ? { isIcon: true, nationId: 3 } : {}) });
  });
  const result = await generateOptimalSquad('4-3-1-2', groups, 1000000, 33, true);
  expect(result.success).toBe(true);
  expect(result.totalChemistry).toBe(33);
  expect(result.totalCost).toBeLessThanOrEqual(1000000);
  expect(result.squad.filter(p => !p.isIcon && p.leagueId === 100)).toHaveLength(5);
  expect(result.squad.filter(p => !p.isIcon && p.leagueId === 101)).toHaveLength(5);
});
