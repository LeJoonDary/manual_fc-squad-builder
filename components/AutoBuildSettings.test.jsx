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
  it('uses one engine without Squad Focus controls or options', async () => {
    expect(container.querySelector('.auto-build-focus')).toBeNull();
    expect(container.textContent).not.toContain('Squad Focus');
    await act(async () => button().click());
    expect(generateOptimalSquad.mock.lastCall[5]).not.toHaveProperty('focus');
    expect(fetchCandidatePlayers.mock.lastCall[4]).not.toHaveProperty('focus');
  });

  it('passes click-ordered priorities to fetching and generation', async () => {
    await act(async () => container.querySelector('.priority-positions-trigger').click());
    const chips = [...container.querySelectorAll('.priority-position-chips button')];
    for (const pos of ['CB','ST','CM','GK']) await act(async () => chips.find(b => b.textContent === pos || b.textContent.startsWith(pos + ' (')).click());
    await act(async () => button().click());
    expect(fetchCandidatePlayers.mock.lastCall[4].keyPositions).toEqual(['CB','ST','CM','GK']);
    expect(generateOptimalSquad.mock.lastCall[5].keyPositions).toEqual(['CB','ST','CM','GK']);
    await act(async () => root.render(<AutoBuildSettings {...props} formation="4-2-3-1" />));
    expect([...container.querySelectorAll('.priority-position-chips button[aria-pressed="true"]')].map(b=>b.textContent)).toEqual(expect.arrayContaining(['1CB','2ST (CF)','3CM (CDM)','4GK']));
    expect(container.textContent).toContain('4 Selected');
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
    expect(list.textContent).toContain('No cards currently excluded.');
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
  it('keeps the budget input live in the flat panel and follows the wireframe order', async () => {
    const budgetSection = document.createElement('section');
    budgetSection.innerHTML = '<input aria-label="Max Budget" />';
    const input = budgetSection.querySelector('input');
    const onInput = vi.fn(); input.addEventListener('input', onInput);
    await act(async () => root.render(<AutoBuildSettings {...props} budgetSection={budgetSection} />));
    expect(container.querySelector('.auto-build-heading')).toBeNull();
    expect(container.querySelector('#auto-build-details')).toBeNull();
    const ordered = ['.auto-build-budget', '.auto-build-range', '.excluded-card-versions-manager', '.tactical-roles-trigger', '.priority-positions', '.auto-build-actions'].map(selector => container.querySelector(selector));
    for (let i = 1; i < ordered.length; i++) expect(ordered[i - 1].compareDocumentPosition(ordered[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ordered[0].contains(input)).toBe(true);
    expect(budgetSection.hidden).toBe(false);
    expect(container.querySelector('.auto-build-reset').disabled).toBe(false);
    expect(container.querySelector('#min-chemistry').min).toBe('20');
    input.value = '123'; input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onInput).toHaveBeenCalledOnce();
    await act(async () => container.querySelector('.priority-positions-trigger').click());
    expect(container.querySelector('.auto-build-budget input')).toBe(input);
    expect(input.value).toBe('123');
  });
  it('updates the remaining budget when locks or ownership change without remounting', async () => {
    const currentSquad = { LCB: { card: { id: 1, price: 3000000 }, isLocked: true } };
    await act(async () => root.render(<AutoBuildSettings {...props} getTargetBudget={() => 10000000}
      getCurrentSquad={() => currentSquad} />));
    expect(container.querySelector('.auto-build-total').textContent).toContain('Available for new selections 7,000,000 C');
    await act(async () => {
      currentSquad.LCB.isOwned = true;
      window.dispatchEvent(new Event('auto-build-context-change'));
    });
    expect(container.querySelector('.auto-build-total')).toBeNull();
    await act(async () => {
      currentSquad.LCB.isOwned = false;
      currentSquad.LCB.isLocked = false;
      window.dispatchEvent(new Event('auto-build-context-change'));
    });
    expect(container.querySelector('.auto-build-total')).toBeNull();
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
    expect(fetchCandidatePlayers).toHaveBeenCalledWith(1000000, '4-3-3', false, props.supabase, { currentSquad: {}, excludeZeroPriceCards: true, excludedCardVersionIds: [], keyPositions: [], squadOvrRange: { min: 45, max: 99 } });
    expect(generateOptimalSquad).toHaveBeenCalledWith('4-3-3', [{ id: 1 }], 1000000, 33, true, { currentSquad: {}, excludeZeroPriceCards: true, excludedCardVersionIds: [], keyPositions: [], squadOvrRange: { min: 45, max: 99 } });
    expect(props.applyAutoBuildResult).toHaveBeenCalledWith(result, { snapshot: 'snapshot', formation: '4-3-3', totalBudget: 1000000 });
    expect(button().disabled).toBe(false);
    expect(container.querySelector('[role="status"]').textContent).toContain('Squad built successfully!');
  });

  it('rejects even a success-flagged 32-chemistry result below target', async () => {
    const fallback = { ...result, success: true, status: 'fallback', totalChemistry: 32 };
    generateOptimalSquad.mockResolvedValue(fallback);
    await act(async () => button().click());
    expect(props.applyAutoBuildResult).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Your current squad was kept.');
    expect(container.textContent).toContain('(32/33)');
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
    expect(container.querySelector('[role="alert"]').textContent).toBe('Could not fill all 11 slots within your budget and eligibility limits. Add candidates, increase your budget, or review exclusions and tactical requirements.');
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
  expect(container.querySelector('[role="alert"]').textContent).toContain('Advanced settings changed');
});

it('places both working modal triggers in the two-column settings grid', async () => {
  const openTacticalRoles = vi.fn();
  await act(async () => root.render(<AutoBuildSettings {...props} openTacticalRoles={openTacticalRoles} />));
  const grid = container.querySelector('.auto-build-modal-grid');
  expect(grid.querySelector('.excluded-card-versions-toggle').textContent).toContain('Excluded Cards (');
  await act(async () => grid.querySelector('.tactical-roles-trigger').click());
  expect(openTacticalRoles).toHaveBeenCalledOnce();
});

it('refreshes the role badge when slot settings change', async () => {
  const state = { slotRequirements: {} };
  await act(async () => root.render(<AutoBuildSettings {...props} getRoleOptions={() => state} />));
  expect(container.querySelector('.tactical-roles-trigger').textContent).toContain('Advanced Settings (0)');
  state.slotRequirements = { LCM: { role: { name: 'Holding', minLevel: 1 } }, RCM: { playstyle: { idOrName: 'Technical', isPlus: true } } };
  await act(async () => window.dispatchEvent(new Event('auto-build-context-change')));
  expect(container.querySelector('.tactical-roles-trigger').textContent).toContain('Advanced Settings (2)');
  state.slotRequirements = {};
  await act(async () => window.dispatchEvent(new Event('auto-build-context-change')));
  expect(container.querySelector('.tactical-roles-trigger').textContent).toContain('Advanced Settings (0)');
});


it('clears exclusions and tactical selections inline without opening dialogs, and resets all settings', async () => {
  let options = { slotRequirements: { ST: { roles: [{ name: 'Poacher', minLevel: 1 }], playstyles: [{ id: 1 }] } } };
  const clearRolesAndPlaystyles = vi.fn(() => { options = { slotRequirements: {} }; window.dispatchEvent(new Event('auto-build-context-change')); });
  const openTacticalRoles = vi.fn();
  const resetTargetBudget = vi.fn();
  await act(async () => {
    excludedCardVersionsStore.ban(99, 'Test');
    root.render(<AutoBuildSettings {...props} getRoleOptions={() => options} clearRolesAndPlaystyles={clearRolesAndPlaystyles} openTacticalRoles={openTacticalRoles} resetTargetBudget={resetTargetBudget} />);
  });
  await act(async () => container.querySelector('[aria-label="Clear excluded cards"]').click());
  expect(excludedCardVersionsStore.getState().excludedCardVersionIds).toEqual([]);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => container.querySelector('[aria-label="Reset All Preferences"]').click());
  expect(openTacticalRoles).not.toHaveBeenCalled();
  expect(container.querySelector('[aria-label="Reset All Preferences"]').disabled).toBe(true);
  await act(async () => {
    excludedCardVersionsStore.ban(100, 'Other');
    excludedCardVersionsStore.setSquadOvrRange({ min: 80, max: 90 });
    options = { slotRequirements: { ST: { role: { name: 'Poacher', minLevel: 1 } } } };
    window.dispatchEvent(new Event('auto-build-context-change'));
  });
  await act(async () => container.querySelector('.auto-build-reset').click());
  expect(resetTargetBudget).toHaveBeenCalledOnce();
  expect(clearRolesAndPlaystyles).toHaveBeenCalledTimes(2);
  expect(excludedCardVersionsStore.getState().excludedCardVersionIds).toEqual([]);
  expect(excludedCardVersionsStore.getState().squadOvrRange).toEqual({ min: 45, max: 99 });
  expect(container.querySelector('.auto-build-focus')).toBeNull();
  expect(container.querySelector('.tactical-roles-trigger').textContent).toContain('Advanced Settings (0)');
});
