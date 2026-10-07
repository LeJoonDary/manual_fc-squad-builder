// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AutoBuildSettings } from './AutoBuildSettings.jsx';
import { fetchCandidatePlayers, generateOptimalSquad } from '../utils/autoBuildUtils.ts';
import { excludedCardVersionsStore } from '../utils/excludedCardVersions.js';

vi.mock('../utils/autoBuildUtils.ts', async importOriginal => ({ ...await importOriginal(), fetchCandidatePlayers: vi.fn(), generateOptimalSquad: vi.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, props;
const result = { success: true, squad: [], manager: null, totalCost: 500000, totalChemistry: 33 };
const button = () => container.querySelector('.auto-build-button');
beforeEach(async () => {
  for (const id of excludedCardVersionsStore.getState().excludedCardVersionIds) excludedCardVersionsStore.unban(id);
  vi.resetAllMocks();
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  props = { formation: '4-3-3', getTargetBudget: () => 1000000, supabase: {},
    getSquadSnapshot: () => 'snapshot', applyAutoBuildResult: vi.fn() };
  fetchCandidatePlayers.mockResolvedValue([{ id: 1 }]);
  generateOptimalSquad.mockResolvedValue(result);
  await act(async () => root.render(<AutoBuildSettings {...props} />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe('Auto Build UI workflow', () => {
  it('offers only chemistry, the existing max budget and focus in the build controls', async () => {
    await act(async () => container.querySelector('.auto-build-heading').click());
    expect(container.textContent).not.toContain('Customize');
    expect(container.textContent).not.toContain('Budget Allocation');
    expect(container.querySelectorAll('#auto-build-details input')).toHaveLength(1);
    const buttons = container.querySelectorAll('.auto-build-focus button');
    expect(buttons).toHaveLength(3);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    for (const [index, focus] of ['attack', 'balanced', 'defense'].entries()) {
      await act(async () => buttons[index].click());
      await act(async () => button().click());
      expect(generateOptimalSquad.mock.lastCall[5].focus).toBe(focus);
      expect(fetchCandidatePlayers.mock.lastCall[4].focus).toBe(focus);
      expect(Object.keys(generateOptimalSquad.mock.lastCall[5])).not.toContain('slotBudgetTargets');
    }
    await act(async () => container.querySelector('.auto-build-reset').click());
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('passes locked owned cards unchanged and rejects an over-budget fallback', async () => {
    const currentSquad = { LW: { card: { id: 1 }, isOwned: true, isLocked: true } };
    await act(async () => root.render(<AutoBuildSettings {...props} getCurrentSquad={() => currentSquad} />));
    generateOptimalSquad.mockResolvedValueOnce({ ...result, success: false, status: 'fallback', totalCost: 1100000 });
    await act(async () => button().click());
    expect(generateOptimalSquad.mock.lastCall[5].currentSquad).toBe(currentSquad);
    expect(props.applyAutoBuildResult).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
  it('shows excluded names, passes exclusions to generation and lets the user unban', async () => {
    await act(async () => excludedCardVersionsStore.ban(77, 'Excluded Player'));
    const toggle = container.querySelector('.excluded-card-versions-toggle');
    expect(toggle.textContent).toContain('(1)');
    await act(async () => toggle.click());
    await act(async () => document.querySelector('#exclusion-tab-excluded').click());
    const list = document.querySelector('#excluded-card-versions-list');
    expect(document.querySelector('#exclusion-panel-excluded').hidden).toBe(false);
    expect(list.textContent).toContain('Excluded Player');
    await act(async () => button().click());
    expect(fetchCandidatePlayers.mock.calls[0][4].excludedCardVersionIds).toEqual(['77']);
    expect(generateOptimalSquad.mock.calls[0][5].excludedCardVersionIds).toEqual(['77']);
    await act(async () => list.querySelector('input[type="checkbox"]').click());
    await act(async () => document.querySelector('.exclusion-bulk-actions button').click());
    expect(excludedCardVersionsStore.getState().excludedCardVersionIds).toEqual([]);
    expect(list.textContent).toContain('No excluded cards');
    await act(async () => button().click());
    expect(fetchCandidatePlayers.mock.calls[1][4].excludedCardVersionIds).toEqual([]);
  });

  it('rejects a result if exclusions changed while generation was in progress', async () => {
    let resolve;
    generateOptimalSquad.mockImplementation(() => new Promise(done => { resolve = done; }));
    await act(async () => button().click());
    await act(async () => excludedCardVersionsStore.ban(77, 'Newly excluded'));
    await act(async () => resolve(result));
    expect(props.applyAutoBuildResult).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]').textContent).toContain('Exclusions changed');
    expect(button().disabled).toBe(false);
  });
  it('keeps the budget input and its listeners inside the accordion across toggles', async () => {
    const budgetSection = document.createElement('section');
    budgetSection.innerHTML = '<input aria-label="Max Budget" />';
    const input = budgetSection.querySelector('input');
    const onInput = vi.fn();
    input.addEventListener('input', onInput);
    await act(async () => root.render(<AutoBuildSettings {...props} budgetSection={budgetSection} getTargetBudget={() => null} />));
    const details = container.querySelector('#auto-build-details');
    expect(details.hidden).toBe(true);
    await act(async () => container.querySelector('.auto-build-heading').click());
    expect(details.hidden).toBe(false);
    expect(details.firstElementChild.contains(input)).toBe(true);
    expect(container.querySelector('.auto-build-total').textContent).toContain('Unlimited budget');
    expect(container.querySelector('.auto-build-ratios')).toBeNull();
    input.value = '123';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onInput).toHaveBeenCalledOnce();
    await act(async () => container.querySelector('.auto-build-heading').click());
    await act(async () => container.querySelector('.auto-build-heading').click());
    expect(details.querySelector('input')).toBe(input);
    expect(input.value).toBe('123');
  });
  it('updates the remaining budget when locks or ownership change without remounting', async () => {
    const currentSquad = { LCB: { card: { id: 1, price: 3000000 }, isLocked: true } };
    await act(async () => root.render(<AutoBuildSettings {...props} getTargetBudget={() => 10000000}
      getCurrentSquad={() => currentSquad} />));
    await act(async () => container.querySelector('.auto-build-heading').click());
    expect(container.querySelector('.auto-build-total').textContent).toContain('Remaining Budget 7,000,000 C');
    await act(async () => {
      currentSquad.LCB.isOwned = true;
      window.dispatchEvent(new Event('auto-build-context-change'));
    });
    expect(container.querySelector('.auto-build-total').textContent).toContain('Remaining Budget 10,000,000 C');
    await act(async () => {
      currentSquad.LCB.isOwned = false;
      currentSquad.LCB.isLocked = false;
      window.dispatchEvent(new Event('auto-build-context-change'));
    });
    expect(container.querySelector('.auto-build-total').textContent).toContain('Locked Player Cost 0 C');
  });

  it('shows loading, prevents duplicate clicks, applies success and resets loading', async () => {
    let resolve;
    fetchCandidatePlayers.mockImplementation(() => new Promise(done => { resolve = done; }));
    await act(async () => button().click());
    expect(button().disabled).toBe(true);
    expect(button().textContent).toContain('Building Squad');
    expect(container.querySelector('.auto-build-spinner')).not.toBeNull();
    await act(async () => button().click());
    expect(fetchCandidatePlayers).toHaveBeenCalledTimes(1);
    await act(async () => resolve([{ id: 1 }]));
    expect(fetchCandidatePlayers).toHaveBeenCalledWith(1000000, '4-3-3', false, props.supabase, { currentSquad: {}, excludeZeroPriceCards: true, excludedCardVersionIds: [], squadOvrRange: { min: 45, max: 99 }, focus: 'attack' });
    expect(generateOptimalSquad).toHaveBeenCalledWith('4-3-3', [{ id: 1 }], 1000000, 33, true, { currentSquad: {}, excludeZeroPriceCards: true, excludedCardVersionIds: [], squadOvrRange: { min: 45, max: 99 }, focus: 'attack' });
    expect(props.applyAutoBuildResult).toHaveBeenCalledWith(result, { snapshot: 'snapshot', formation: '4-3-3', totalBudget: 1000000 });
    expect(button().disabled).toBe(false);
    expect(container.querySelector('[role="status"]').textContent).toContain('Squad built successfully!');
  });

  it('uses unlimited mode at zero budget', async () => {
    await act(async () => root.render(<AutoBuildSettings {...props} getTargetBudget={() => 0} />));
    await act(async () => button().click());
    expect(fetchCandidatePlayers.mock.calls[0][0]).toBe(0);
    expect(props.applyAutoBuildResult).toHaveBeenCalled();
    expect(button().disabled).toBe(false);
  });

  it('preserves the existing squad when no feasible squad is found', async () => {
    generateOptimalSquad.mockResolvedValue({ success: false });
    await act(async () => button().click());
    expect(props.applyAutoBuildResult).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]').textContent).toBe('No squad meets your requirements. Try increasing your budget, lowering the chemistry target, or reducing selected roles & playstyles.');
    expect(button().disabled).toBe(false);
  });

  it('recovers from network and stale-result errors and can retry', async () => {
    fetchCandidatePlayers.mockRejectedValueOnce(new Error('네트워크 오류'));
    await act(async () => button().click());
    expect(container.querySelector('[role="alert"]').textContent).toBe('네트워크 오류');
    expect(button().disabled).toBe(false);
    expect(props.applyAutoBuildResult).not.toHaveBeenCalled();
    props.applyAutoBuildResult.mockImplementationOnce(() => { throw new Error('스쿼드가 changed되었습니다.'); });
    await act(async () => button().click());
    expect(container.querySelector('[role="alert"]').textContent).toContain('changed');
    expect(button().disabled).toBe(false);
    await act(async () => button().click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });
});

it('passes role settings to retrieval and generation', async () => {
  const roleOptions = { isStrictRoleMode: true, slotRoleRequirements: { ST: { roleName: 'Poacher', minLevel: 1 } } };
  await act(async () => root.render(<AutoBuildSettings {...props} getRoleOptions={() => roleOptions} />));
  await act(async () => button().click());
  expect(fetchCandidatePlayers.mock.lastCall[4]).toMatchObject(roleOptions);
  expect(generateOptimalSquad.mock.lastCall[5]).toMatchObject(roleOptions);
  expect(props.applyAutoBuildResult).toHaveBeenCalled();
});

it('does not apply a result after role requirements change during generation', async () => {
  const roleOptions = { isStrictRoleMode: false, slotRoleRequirements: {} };
  await act(async () => root.render(<AutoBuildSettings {...props} getRoleOptions={() => roleOptions} />));
  generateOptimalSquad.mockImplementationOnce(async () => {
    roleOptions.isStrictRoleMode = true;
    return result;
  });
  await act(async () => button().click());
  expect(props.applyAutoBuildResult).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]').textContent).toContain('Role settings changed');
});

it('places both working modal triggers in the two-column settings grid', async () => {
  const openTacticalRoles = vi.fn();
  await act(async () => root.render(<AutoBuildSettings {...props} openTacticalRoles={openTacticalRoles} />));
  const grid = container.querySelector('.auto-build-modal-grid');
  expect(grid.querySelector('.excluded-card-versions-toggle').textContent).toContain('Manage Excluded Cards (');
  await act(async () => grid.querySelector('.tactical-roles-trigger').click());
  expect(openTacticalRoles).toHaveBeenCalledOnce();
});

it('refreshes the role badge when slot settings change', async () => {
  const state = { slotRequirements: {} };
  await act(async () => root.render(<AutoBuildSettings {...props} getRoleOptions={() => state} />));
  expect(container.querySelector('.tactical-roles-trigger').textContent).toContain('Tactical Roles (0개) / Playstyles (0개)');
  state.slotRequirements = { LCM: { role: { name: 'Holding', minLevel: 1 } }, RCM: { playstyle: { idOrName: 'Technical', isPlus: true } } };
  await act(async () => window.dispatchEvent(new Event('auto-build-context-change')));
  expect(container.querySelector('.tactical-roles-trigger').textContent).toContain('Tactical Roles (1개) / Playstyles (1개)');
  state.slotRequirements = {};
  await act(async () => window.dispatchEvent(new Event('auto-build-context-change')));
  expect(container.querySelector('.tactical-roles-trigger').textContent).toContain('Tactical Roles (0개) / Playstyles (0개)');
});
