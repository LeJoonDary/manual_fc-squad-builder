// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { generateOptimalSquad, groupCandidatePlayers } from './autoBuildUtils.ts';
import { createSquadCandidateRows } from '../scripts/mocks/squadCandidates.js';
import { getPositionBudgetGroup } from './autoBuildUtils.ts';

const bridge = vi.hoisted(() => ({ services: null }));
vi.mock('./playstyleFilters.js', async importOriginal => ({ ...(await importOriginal()), fetchPlaystyleOptions: async () => [{ id: 7, name: 'Intercept', category: 'Defending', image_url: '/silver.png', image_url_plus: '/gold.png' }] }));
vi.mock('./affiliations.js', async importOriginal => ({ ...(await importOriginal()),
  fetchAffiliations: async () => ({ leagues: [], nations: [], clubs: [] }),
}));
vi.mock('../components/AutoBuildSettings.jsx', () => ({ mountAutoBuildSettings: (_container, _formation, _budget, services) => {
  bridge.services = services;
  return () => {};
} }));

beforeAll(async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  document.documentElement.innerHTML = readFileSync('index.html', 'utf8');
  await import('../main.js');
  const budget = document.querySelector('#target-budget');
  budget.value = '1000000';
  budget.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('auto build pitch integration', () => {
  it('keeps a fixed canvas, moves the picker inside it and normalizes only display labels', () => {
    const pitch = document.querySelector('.pitch');
    expect(pitch.contains(document.querySelector('#formation-picker'))).toBe(true);
    const select = name => [...document.querySelectorAll('#formation-menu button')].find(button => button.textContent === name).click();
    const height = pitch.style.getPropertyValue('--formation-height');
    select('4-3-3 (2)');
    expect(pitch.style.getPropertyValue('--formation-height')).toBe(height);
    expect(pitch.querySelector('[data-position="CDM"]').style.top).toBe('57%');
    expect(pitch.querySelector('[data-position="LCM"]').textContent).toBe('CM');
    select('4-4-2');
    expect(pitch.querySelector('[data-position="LS"]').textContent).toBe('ST');
    expect(pitch.querySelector('[data-position="LCB"]').textContent).toBe('CB');
    select('4-3-3');
  });
  it('renders all cards, manager and totals using the real application bridge', async () => {
    const rows = createSquadCandidateRows().map(row => ({ ...row,
      candidateGroups: [getPositionBudgetGroup(row.card_positions[0].positions.name, false)] }));
    const result = await generateOptimalSquad('4-3-3', groupCandidatePlayers(rows), 1000000, 33, true);
    const request = { snapshot: bridge.services.getSquadSnapshot(), formation: '4-3-3', totalBudget: 1000000 };
    bridge.services.applyAutoBuildResult(result, request);
    expect(document.querySelectorAll('.pitch .slot.occupied')).toHaveLength(11);
    expect(document.querySelector('#total-cost').value).toBe(result.totalCost.toLocaleString('en-US'));
    expect(document.querySelector('#total-chemistry').value).toBe('33');
    expect(document.querySelector('#manager-slot').textContent).toContain('Smart Manager');
    expect(document.querySelectorAll('.pitch .is-out-of-position')).toHaveLength(0);

    const before = bridge.services.getSquadSnapshot();
    expect(() => bridge.services.applyAutoBuildResult(result, request)).toThrow('changed');
    expect(bridge.services.getSquadSnapshot()).toBe(before);

    bridge.services.applyAutoBuildResult({ ...result, manager: null }, { ...request, snapshot: before });
    expect(document.querySelector('#manager-slot').classList.contains('is-configured')).toBe(false);

    const leftWing = document.querySelector('.slot[data-position="LW"]');
    leftWing.querySelector('.owned-player').click();
    leftWing.querySelector('.lock-player').click();
    const currentSquad = bridge.services.getCurrentSquad();
    expect(currentSquad.LW).toMatchObject({ isOwned: true, isLocked: true });
    const rebuilt = await generateOptimalSquad('4-3-3', groupCandidatePlayers(rows), 1000000, 33, false, { currentSquad });
    bridge.services.applyAutoBuildResult(rebuilt, { ...request, snapshot: bridge.services.getSquadSnapshot() });
    expect(leftWing.dataset.cardId).toBe(String(currentSquad.LW.card_id));
    expect(leftWing.classList.contains('is-locked')).toBe(true);
    expect(leftWing.classList.contains('is-owned')).toBe(true);
    expect(document.querySelector('#total-cost').value).toBe(rebuilt.totalCost.toLocaleString('en-US'));
    expect(rebuilt.totalCost).toBe(810000);
    bridge.services.resetTargetBudget();
    expect(document.querySelector('#target-budget').value).toBe('');
    expect(document.querySelector('#budget-percentage').textContent).toBe('Unlimited');
    expect(leftWing.classList.contains('is-locked')).toBe(true);
    const cheap = await generateOptimalSquad('4-3-3', groupCandidatePlayers(rows), 0, 33, false,
      { currentSquad: bridge.services.getCurrentSquad() });
    expect(cheap.status).toBe('success');
    bridge.services.applyAutoBuildResult(cheap, {
      snapshot: bridge.services.getSquadSnapshot(), formation: '4-3-3', totalBudget: 0,
    });
    expect(document.querySelectorAll('.pitch .slot.occupied')).toHaveLength(11);
    expect(leftWing.classList.contains('is-locked')).toBe(true);
    expect(leftWing.classList.contains('is-owned')).toBe(true);
    expect(document.querySelector('#total-cost').value).toBe(cheap.totalCost.toLocaleString('en-US'));
    expect(cheap.totalCost).toBe(900000);
  });
});

it('connects exclusive Role+/Role++ choices and Require Selected Roles to auto build', () => {
  document.querySelector('[data-position-filter="ST"]').click();
  const plus = () => document.querySelector('#role-filter-list button[aria-label="ST Advanced Forward Role+ filters"]');
  const doublePlus = () => document.querySelector('#role-filter-list button[aria-label="ST Advanced Forward Role++ filters"]');
  plus().click();
  expect(bridge.services.getRoleOptions()).toEqual({
    slotRequirements: { ST: { roles: [{ name: 'Advanced Forward', minLevel: 1 }] } },
  });
  doublePlus().click();
  expect(plus().getAttribute('aria-pressed')).toBe('false');
  expect(bridge.services.getRoleOptions().slotRequirements.ST.roles[0].minLevel).toBe(2);
  expect(document.querySelector('#has-all-selected-roles')).toBeNull();
  document.querySelector('.role-all-chip').click();
  expect(bridge.services.getRoleOptions()).toEqual({ slotRequirements: {} });
});

it('opens Tactical Roles independently of catalog position filters and restores controls on close', () => {
  const content = document.querySelector('.position-role-subfilter');
  const parent = content.parentNode;
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function () { this.open = true; } });
  bridge.services.openTacticalRoles();
  const dialog = document.querySelector('.tactical-roles-dialog');
  expect(dialog.contains(content)).toBe(true);
  expect(dialog.querySelector('[aria-label="ST Advanced Forward Role+ filters"]')).not.toBeNull();
  expect(dialog.querySelector('[aria-label="CM Playmaker Role+ filters"]')).toBeNull();
  expect(dialog.querySelectorAll('.tactical-slot')).toHaveLength(11);
  dialog.querySelector('[data-slot="LCM"]').click();
  expect(dialog.querySelector('[aria-label="CM Playmaker Role+ filters"]')).not.toBeNull();
  dialog.querySelector('[aria-label="CM Playmaker Role+ filters"]').click();
  expect(bridge.services.getRoleOptions().slotRequirements.LCM).toEqual({ roles: [{ name: 'Playmaker', minLevel: 1 }] });
  expect(dialog.querySelector('[data-slot="LCM"] .tactical-role-dot')).not.toBeNull();
  dialog.querySelector('[data-slot="RCM"]').click();
  expect(dialog.querySelector('[aria-label="CM Playmaker Role+ filters"]').getAttribute('aria-pressed')).toBe('false');
  dialog.querySelector('[aria-label="CM Holding Role++ filters"]').click();
  expect(Object.keys(bridge.services.getRoleOptions().slotRequirements)).toEqual(['LCM', 'RCM']);
  dialog.querySelector('[aria-label="CM Playmaker Role+ filters"]').click();
  expect(bridge.services.getRoleOptions().slotRequirements.RCM.roles).toHaveLength(2);
  dialog.querySelector('[aria-label="CM Playmaker Role++ filters"]').click();
  expect(bridge.services.getRoleOptions().slotRequirements.RCM.roles).toEqual([{ name: 'Holding', minLevel: 2 }, { name: 'Playmaker', minLevel: 2 }]);
  dialog.querySelector('[aria-label="CM Playmaker Role++ filters"]').click();
  expect(bridge.services.getRoleOptions().slotRequirements.RCM.roles).toEqual([{ name: 'Holding', minLevel: 2 }]);
  dialog.querySelector('[data-tab="playstyles"]').click();
  expect(dialog.querySelector('[aria-label="CM Holding Role++ filters"]')).toBeNull();
  expect(dialog.querySelectorAll('.tactical-playstyle-diamond')).toHaveLength(1);
  dialog.querySelector('[data-playstyle-id="7"]').click();
  expect(bridge.services.getRoleOptions().slotRequirements.RCM).toEqual({
    roles: [{ name: 'Holding', minLevel: 2 }], playstyles: [{ id: 7, name: 'Intercept', isPlus: false }],
  });
  dialog.querySelector('[data-playstyle-id="7"]').click();
  expect(bridge.services.getRoleOptions().slotRequirements.RCM.playstyles[0].isPlus).toBe(true);
  expect(dialog.querySelector('[data-playstyle-id="7"] img').getAttribute('src')).toBe('/gold.png');
  dialog.querySelector('[data-playstyle-id="7"]').click();
  expect(bridge.services.getRoleOptions().slotRequirements.RCM.playstyles).toBeUndefined();
  expect(dialog.querySelector('[data-playstyle-id="7"] img').getAttribute('src')).toBe('/silver.png');
  expect(Object.keys(bridge.services.getRoleOptions().slotRequirements)).toHaveLength(2);
  dialog.querySelector('[aria-label="Skill Moves ★4+"]').click();
  dialog.querySelector('[aria-label="Weak Foot ★5"]').click();
  expect(bridge.services.getRoleOptions().slotRequirements.RCM).toMatchObject({ minSm: 4, minWf: 5 });
  dialog.querySelector('[data-slot="LCM"]').click();
  expect(dialog.querySelector('[aria-label="Skill Moves Any"]').getAttribute('aria-pressed')).toBe('true');
  dialog.querySelector('[data-slot="RCM"]').click();
  expect(dialog.querySelector('[aria-label="Skill Moves ★4+"]').getAttribute('aria-pressed')).toBe('true');
  dialog.querySelector('.tactical-clear-all').click();
  expect(bridge.services.getRoleOptions()).toEqual({ slotRequirements: {} });
  expect(dialog.querySelectorAll('.tactical-role-dot')).toHaveLength(0);
  dialog.querySelector('[data-playstyle-id="7"]').click();
  dialog.querySelector('[data-tab="roles"]').click();
  dialog.querySelector('[aria-label="CM Holding Role++ filters"]').click();
  expect(bridge.services.getRoleOptions().slotRequirements.RCM.roles).toHaveLength(1);
  expect(bridge.services.getRoleOptions().slotRequirements.RCM.playstyles).toHaveLength(1);
  bridge.services.clearRolesAndPlaystyles();
  expect(bridge.services.getRoleOptions()).toEqual({ slotRequirements: {} });
  expect(dialog.querySelectorAll('.tactical-role-dot')).toHaveLength(0);
  expect(dialog.textContent).not.toContain('Require Selected Roles');
  dialog.dispatchEvent(new Event('close'));
  expect(content.parentNode).toBe(parent);
  expect(document.querySelector('.tactical-roles-dialog')).toBeNull();
  delete HTMLDialogElement.prototype.showModal;
});
