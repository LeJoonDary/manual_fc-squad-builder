import { describe, expect, it } from 'vitest';
import { clearUnlockedSquadEntries, createSquadEntry, isSquadSlotLocked, toggleSquadSlotLock } from './squadLock';

describe('squad slot lock state', () => {
  it('creates a placed card in the unlocked state', () => {
    const entry = createSquadEntry('card-1', { name: 'Zidane' }, { id: 'card-1' });

    expect(entry.isLocked).toBe(false);
    expect(isSquadSlotLocked(entry)).toBe(false);
  });

  it('toggles and retains the lock state on the squad entry', () => {
    const entry = createSquadEntry('card-1', { name: 'Zidane' }, { id: 'card-1' });

    expect(toggleSquadSlotLock(entry)).toBe(true);
    expect(isSquadSlotLocked(entry)).toBe(true);
    expect(toggleSquadSlotLock(entry)).toBe(false);
    expect(isSquadSlotLocked(entry)).toBe(false);
  });

  it('clears only unlocked players and retains locked players', () => {
    const locked = createSquadEntry('card-1', { name: 'Zidane' }, { id: 'card-1' });
    const unlocked = createSquadEntry('card-2', { name: 'Mbappe' }, { id: 'card-2' });
    toggleSquadSlotLock(locked);
    const squad = { CAM: locked, ST: unlocked, GK: null };

    expect(clearUnlockedSquadEntries(squad)).toEqual(['ST']);
    expect(squad.CAM).toBe(locked);
    expect(squad.CAM?.isLocked).toBe(true);
    expect(squad.ST).toBeNull();
  });
});
