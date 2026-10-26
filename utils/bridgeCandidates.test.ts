import { expect, test } from 'vitest';
import { getDynamicCandidatesForSlot, type GeneratedPlayer } from './autoBuildUtils';

const make = (id: string, extra: Partial<GeneratedPlayer> = {}): GeneratedPlayer => ({
  id, name: id, playerKey: id, position: 'CM', slotPosition: 'CM', altPositions: [],
  nationId: 9, leagueId: 100, clubId: 9, price: 100, metaScore: 1000,
  isOwned: false, isLocked: false, card: {}, ...extra,
});
const target = make('zero', { nationId: 1, clubId: 1 });
const base = Array.from({ length: 25 }, (_, i) => make(`base-${i}`, { metaScore: 1000 - i }));
const hero = (id: string, score = 10) => make(id, { isHero: true, nationId: 1, metaScore: score });
const icon = (id: string, score = 10) => make(id, { isIcon: true, nationId: 1, leagueId: 2118, metaScore: score });
const run = (pool: GeneratedPlayer[], squad = [target], options = {}, bridgePool = pool) =>
  getDynamicCandidatesForSlot('CM', squad, pool, 100, null, 25, null, false, 33, options, bridgePool);

test('keeps all 25 base cards and appends two heroes and one icon in natural score order', () => {
  const result = run([...base, hero('kuyt', 20), hero('hero2', 19), hero('hero3', 18), icon('icon1', 17), icon('icon2', 16)]);
  expect(result).toHaveLength(28);
  expect(result.slice(0, 25).map(p => p.id)).toEqual(base.map(p => p.id));
  expect(result.slice(25).map(p => p.id)).toEqual(['kuyt', 'hero2', 'icon1']);
});

test('rescue cards can be found beyond the stage source cutoff and IDs are deduplicated', () => {
  const result = run([...base, base[0]], [target], {}, [...base, hero('late'), hero('late'), icon('late-icon')]);
  expect(result).toHaveLength(27);
  expect(new Set(result.map(p => p.id)).size).toBe(27);
  expect(result.some(p => p.id === 'late')).toBe(true);
});

test('requires matching nation AND league on the same zero-chemistry player for heroes', () => {
  const other = make('other', { nationId: 2, leagueId: 200, clubId: 2 });
  const cross = hero('cross'); cross.leagueId = 200;
  const result = run([...base, cross, hero('correct'), icon('nation-only')], [target, other]);
  expect(result.map(p => p.id)).not.toContain('cross');
  expect(result.map(p => p.id)).toContain('correct');
  expect(result.map(p => p.id)).toContain('nation-only');
});

test('does not append without a zero-chemistry occupied player', () => {
  expect(run([...base, hero('hero'), icon('icon')], [])).toHaveLength(25);
  const linked = make('linked', { nationId: 1, clubId: 1 });
  expect(run([...base, hero('hero'), icon('icon')], [target, linked])).toHaveLength(25);
});

test('rescue respects budget, used players, and separate and combined special limits', () => {
  const expensive = hero('expensive'); expensive.price = 101;
  const duplicate = hero('duplicate'); duplicate.playerKey = target.playerKey;
  const pool = [...base, expensive, duplicate, hero('hero'), icon('icon')];
  expect(run(pool).map(p => p.id)).not.toContain('expensive');
  expect(run(pool).map(p => p.id)).not.toContain('duplicate');
  expect(run(pool, [target], { maxHeroes: 0 }).map(p => p.id)).not.toContain('hero');
  expect(run(pool, [target], { maxIcons: 0 }).map(p => p.id)).not.toContain('icon');
  expect(run(pool, [target], { maxSpecialCards: 0 })).toHaveLength(25);
});

test('uses meta ranking for each reserve quota but does not pin rescue cards first', () => {
  const result = run([...base, icon('low-icon', 1), icon('best-icon', 20), hero('low-hero', 1), hero('best-hero', 30), hero('second-hero', 25)]);
  expect(result.map(p => p.id)).toContain('best-icon');
  expect(result.map(p => p.id)).not.toContain('low-icon');
  expect(result.map(p => p.id)).not.toContain('low-hero');
  expect(result[0].id).toBe('base-0');
});
