// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { generateOptimalSquad, groupCandidatePlayers } from './autoBuildUtils.ts';
import { createSquadCandidateRows } from '../scripts/mocks/squadCandidates.js';
import { getPositionBudgetGroup } from './autoBuildUtils.ts';

const bridge = vi.hoisted(() => ({ services: null }));
vi.mock('./playstyleFilters.js', async importOriginal => ({ ...(await importOriginal()), fetchPlaystyleOptions: async () => [] }));
vi.mock('./affiliations.js', async importOriginal => ({ ...(await importOriginal()),
  fetchAffiliations: async () => ({ leagues: [], nations: [], clubs: [] }),
}));
vi.mock('../components/AutoBuildSettings.jsx', () => ({ mountAutoBuildSettings: (_container, _formation, _budget, services) => {
  bridge.services = services;
  return () => {};
} }));

beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  document.documentElement.innerHTML = readFileSync('index.html', 'utf8');
  await import('../main.js');
  const budget = document.querySelector('#target-budget');
  budget.value = '1000000';
  budget.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('auto build pitch integration', () => {
  it('renders all cards, manager and totals using the real application bridge', async () => {
    const rows = createSquadCandidateRows().map(row => ({ ...row,
      candidateGroups: [getPositionBudgetGroup(row.card_positions[0].positions.name, false)] }));
    const result = await generateOptimalSquad('4-3-3', groupCandidatePlayers(rows), 1000000, 33, true);
    const request = { snapshot: bridge.services.getSquadSnapshot(), formation: '4-3-3', totalBudget: 1000000 };
    bridge.services.applyAutoBuildResult(result, request);
    expect(document.querySelectorAll('.pitch .slot.occupied')).toHaveLength(11);
    expect(document.querySelector('#total-cost').value).toBe('990,000');
    expect(document.querySelector('#total-chemistry').value).toBe('33');
    expect(document.querySelector('#manager-slot').textContent).toContain('Smart Manager');
    expect(document.querySelectorAll('.pitch .is-out-of-position')).toHaveLength(0);

    const before = bridge.services.getSquadSnapshot();
    expect(() => bridge.services.applyAutoBuildResult(result, request)).toThrow('변경');
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
    expect(document.querySelector('#total-cost').value).toBe('900,000');
    expect(rebuilt.totalCost).toBe(900000);
    bridge.services.resetTargetBudget();
    expect(document.querySelector('#target-budget').value).toBe('');
    expect(document.querySelector('#budget-percentage').textContent).toBe('제한 없음');
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
    expect(document.querySelector('#total-cost').value).toBe('900,000');
  });
});
