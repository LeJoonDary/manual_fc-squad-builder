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
    expect(fetchCandidatePlayers.mock.calls[0][5].excludedCardVersionIds).toEqual(['77']);
    expect(generateOptimalSquad.mock.calls[0][5].excludedCardVersionIds).toEqual(['77']);
    await act(async () => list.querySelector('input[type="checkbox"]').click());
    await act(async () => document.querySelector('.exclusion-bulk-actions button').click());
    expect(excludedCardVersionsStore.getState().excludedCardVersionIds).toEqual([]);
    expect(list.textContent).toContain('제외된 카드가 없습니다');
    await act(async () => button().click());
    expect(fetchCandidatePlayers.mock.calls[1][5].excludedCardVersionIds).toEqual([]);
  });

  it('rejects a result if exclusions changed while generation was in progress', async () => {
    let resolve;
    generateOptimalSquad.mockImplementation(() => new Promise(done => { resolve = done; }));
    await act(async () => button().click());
    await act(async () => excludedCardVersionsStore.ban(77, 'Newly excluded'));
    await act(async () => resolve(result));
    expect(props.applyAutoBuildResult).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]').textContent).toContain('제외 목록이 변경');
    expect(button().disabled).toBe(false);
  });
  it('keeps the budget input and its listeners inside the accordion across toggles', async () => {
    const budgetSection = document.createElement('section');
    budgetSection.innerHTML = '<input aria-label="예산 상한" />';
    const input = budgetSection.querySelector('input');
    const onInput = vi.fn();
    input.addEventListener('input', onInput);
    await act(async () => root.render(<AutoBuildSettings {...props} budgetSection={budgetSection} getTargetBudget={() => null} />));
    const details = container.querySelector('#auto-build-details');
    expect(details.hidden).toBe(true);
    await act(async () => container.querySelector('.auto-build-heading').click());
    expect(details.hidden).toBe(false);
    expect(details.firstElementChild.contains(input)).toBe(true);
    expect(container.querySelector('.auto-build-total').textContent).toContain('예산 무제한');
    expect(container.querySelector('.auto-build-ratios').disabled).toBe(true);
    input.value = '123';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onInput).toHaveBeenCalledOnce();
    await act(async () => container.querySelector('.auto-build-heading').click());
    await act(async () => container.querySelector('.auto-build-heading').click());
    expect(details.querySelector('input')).toBe(input);
    expect(input.value).toBe('123');
  });
  it('synchronizes sliders and comma-formatted coin inputs within the remaining budget', async () => {
    await act(async () => container.querySelector('.auto-build-heading').click());
    const change = async (id, value) => act(async () => {
      const input = container.querySelector(id);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await change('#budget-allocation-MF', '100,000');
    await change('#budget-ratio-FW', '40');
    expect(container.querySelector('#budget-allocation-FW').value).toBe('400,000');
    await change('#budget-allocation-FW', '250,000');
    expect(Number(container.querySelector('#budget-ratio-FW').value)).toBe(25);
    expect(Number(container.querySelector('#budget-ratio-FW').max)).toBeCloseTo(56.6666);
    await change('#budget-allocation-FW', '999,999');
    expect(container.querySelector('#budget-allocation-FW').value).toBe('250,000');
  });

  it('updates the remaining budget when locks or ownership change without remounting', async () => {
    const currentSquad = { LCB: { card: { id: 1, price: 3000000 }, isLocked: true } };
    await act(async () => root.render(<AutoBuildSettings {...props} getTargetBudget={() => 10000000}
      getCurrentSquad={() => currentSquad} />));
    await act(async () => container.querySelector('.auto-build-heading').click());
    expect(container.querySelector('.auto-build-total').textContent).toContain('총 잔여 예산 7,000,000 C');
    await act(async () => {
      currentSquad.LCB.isOwned = true;
      window.dispatchEvent(new Event('auto-build-context-change'));
    });
    expect(container.querySelector('.auto-build-total').textContent).toContain('총 잔여 예산 10,000,000 C');
    await act(async () => {
      currentSquad.LCB.isOwned = false;
      currentSquad.LCB.isLocked = false;
      window.dispatchEvent(new Event('auto-build-context-change'));
    });
    expect(container.querySelector('.auto-build-total').textContent).toContain('락 선수 비용 0 C');
  });

  it('applies a completed cheap fallback and shows the budget shortfall without an error', async () => {
    const fallback = { ...result, success: false, status: 'fallback', totalCost: 1100000 };
    generateOptimalSquad.mockResolvedValueOnce(fallback);
    await act(async () => button().click());
    expect(props.applyAutoBuildResult).toHaveBeenCalledWith(fallback, expect.anything());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]').textContent).toContain('100,000 C 초과');
  });
  it('accepts coin amounts and rejects allocations above the total budget', async () => {
    await act(async () => container.querySelector('.auto-build-heading').click());
    const input = container.querySelector('#budget-allocation-FW');
    expect(input.type).toBe('text');
    const setValue = async value => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await setValue('200000');
    expect(input.value).toBe('200,000');
    await setValue('900000');
    expect(input.value).toBe('200,000');
    expect(container.querySelector('[role="alert"]').textContent).toContain('총 잔여 예산');
    await act(async () => button().click());
    expect(fetchCandidatePlayers.mock.calls[0][1]).toEqual({ FW: 200000, MF: 333333, DF: 333334 });
  });

  it('rescales allocations when the total budget changes', async () => {
    await act(async () => root.render(<AutoBuildSettings {...props} getTargetBudget={() => 500000} />));
    await act(async () => button().click());
    expect(fetchCandidatePlayers.mock.calls[0][1]).toEqual({ FW: 166666, MF: 166666, DF: 166667 });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
  it('passes ownership/locks and the special cap, and resets settings and budget', async () => {
    const currentSquad = { LW: { card: { id: 1 }, isOwned: true, isLocked: true } };
    const resetTargetBudget = vi.fn();
    await act(async () => root.render(<AutoBuildSettings {...props} getCurrentSquad={() => currentSquad} resetTargetBudget={resetTargetBudget} />));
    await act(async () => container.querySelector('.auto-build-heading').click());
    const select = container.querySelector('#auto-build-special-mode');
    await act(async () => { select.value = 'none'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => container.querySelector('input[type="checkbox"]').click());
    await act(async () => button().click());
    expect(generateOptimalSquad).toHaveBeenLastCalledWith('4-3-3', [{ id: 1 }], 1000000, 33, false, { currentSquad, excludedCardVersionIds: [], budgetAllocations: { FW: 333333, MF: 333333, DF: 333334 }, maxSpecialCards: 0 });
    await act(async () => container.querySelector('.auto-build-reset').click());
    expect(resetTargetBudget).toHaveBeenCalledOnce();
    expect(select.value).toBe('unlimited');
    expect(container.querySelector('input[type="checkbox"]').checked).toBe(true);
    expect(container.querySelector('#min-chemistry').value).toBe('33');
    expect(['FW', 'MF', 'DF'].map(group => container.querySelector(`#budget-allocation-${group}`).value)).toEqual(['333,333', '333,333', '333,334']);
  });
  it('shows loading, prevents duplicate clicks, applies success and resets loading', async () => {
    let resolve;
    fetchCandidatePlayers.mockImplementation(() => new Promise(done => { resolve = done; }));
    await act(async () => button().click());
    expect(button().disabled).toBe(true);
    expect(button().textContent).toContain('스쿼드 구성 중');
    expect(container.querySelector('.auto-build-spinner')).not.toBeNull();
    await act(async () => button().click());
    expect(fetchCandidatePlayers).toHaveBeenCalledTimes(1);
    await act(async () => resolve([{ id: 1 }]));
    expect(fetchCandidatePlayers).toHaveBeenCalledWith(1000000, { FW: 333333, MF: 333333, DF: 333334 }, '4-3-3', false, props.supabase, { currentSquad: {}, excludedCardVersionIds: [], budgetAllocations: { FW: 333333, MF: 333333, DF: 333334 }, maxSpecialCards: null });
    expect(generateOptimalSquad).toHaveBeenCalledWith('4-3-3', [{ id: 1 }], 1000000, 33, true, { currentSquad: {}, excludedCardVersionIds: [], budgetAllocations: { FW: 333333, MF: 333333, DF: 333334 }, maxSpecialCards: null });
    expect(props.applyAutoBuildResult).toHaveBeenCalledWith(result, { snapshot: 'snapshot', formation: '4-3-3', totalBudget: 1000000 });
    expect(button().disabled).toBe(false);
    expect(container.querySelector('[role="status"]').textContent).toContain('완료');
  });

  it('uses unlimited mode at zero budget', async () => {
    await act(async () => root.render(<AutoBuildSettings {...props} getTargetBudget={() => 0} />));
    await act(async () => button().click());
    expect(fetchCandidatePlayers.mock.calls[0][1]).toEqual({ FW: 0, MF: 0, DF: 0 });
    expect(props.applyAutoBuildResult).toHaveBeenCalled();
    expect(button().disabled).toBe(false);
  });

  it('preserves the existing squad when no feasible squad is found', async () => {
    generateOptimalSquad.mockResolvedValue({ success: false });
    await act(async () => button().click());
    expect(props.applyAutoBuildResult).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]').textContent).toBe('조건을 만족하는 스쿼드를 찾지 못했습니다. 예산을 늘리거나 케미스트리 조건을 낮춰주세요.');
    expect(button().disabled).toBe(false);
  });

  it('recovers from network and stale-result errors and can retry', async () => {
    fetchCandidatePlayers.mockRejectedValueOnce(new Error('네트워크 오류'));
    await act(async () => button().click());
    expect(container.querySelector('[role="alert"]').textContent).toBe('네트워크 오류');
    expect(button().disabled).toBe(false);
    expect(props.applyAutoBuildResult).not.toHaveBeenCalled();
    props.applyAutoBuildResult.mockImplementationOnce(() => { throw new Error('스쿼드가 변경되었습니다.'); });
    await act(async () => button().click());
    expect(container.querySelector('[role="alert"]').textContent).toContain('변경');
    expect(button().disabled).toBe(false);
    await act(async () => button().click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });
});
