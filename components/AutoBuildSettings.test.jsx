// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AutoBuildSettings } from './AutoBuildSettings.jsx';
import { fetchCandidatePlayers, generateOptimalSquad } from '../utils/autoBuildUtils.ts';

vi.mock('../utils/autoBuildUtils.ts', () => ({ fetchCandidatePlayers: vi.fn(), generateOptimalSquad: vi.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, props;
const result = { success: true, squad: [], manager: null, totalCost: 500000, totalChemistry: 33 };
const button = () => container.querySelector('.auto-build-button');
beforeEach(async () => {
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
  it('passes ownership/locks and the special cap, and resets settings and budget', async () => {
    const currentSquad = { LW: { card: { id: 1 }, isOwned: true, isLocked: true } };
    const resetTargetBudget = vi.fn();
    await act(async () => root.render(<AutoBuildSettings {...props} getCurrentSquad={() => currentSquad} resetTargetBudget={resetTargetBudget} />));
    await act(async () => container.querySelector('.auto-build-heading').click());
    const select = container.querySelector('#auto-build-special-mode');
    await act(async () => { select.value = 'none'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => container.querySelector('input[type="checkbox"]').click());
    await act(async () => button().click());
    expect(generateOptimalSquad).toHaveBeenLastCalledWith('4-3-3', [{ id: 1 }], 1000000, 33, false, { currentSquad, maxSpecialCards: 0 });
    await act(async () => container.querySelector('.auto-build-reset').click());
    expect(resetTargetBudget).toHaveBeenCalledOnce();
    expect(select.value).toBe('unlimited');
    expect(container.querySelector('input[type="checkbox"]').checked).toBe(true);
    expect(container.querySelector('#min-chemistry').value).toBe('33');
    expect(['FW', 'MF', 'DF'].map(group => container.querySelector(`#budget-ratio-${group}`).value)).toEqual(['40', '35', '25']);
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
    expect(fetchCandidatePlayers).toHaveBeenCalledWith(1000000, { FW: 40, MF: 35, DF: 25 }, '4-3-3', false, props.supabase, { currentSquad: {}, maxSpecialCards: null });
    expect(generateOptimalSquad).toHaveBeenCalledWith('4-3-3', [{ id: 1 }], 1000000, 33, true, { currentSquad: {}, maxSpecialCards: null });
    expect(props.applyAutoBuildResult).toHaveBeenCalledWith(result, { snapshot: 'snapshot', formation: '4-3-3', totalBudget: 1000000 });
    expect(button().disabled).toBe(false);
    expect(container.querySelector('[role="status"]').textContent).toContain('완료');
  });

  it('does not query or apply a zero budget', async () => {
    await act(async () => root.render(<AutoBuildSettings {...props} getTargetBudget={() => 0} />));
    await act(async () => button().click());
    expect(fetchCandidatePlayers).not.toHaveBeenCalled();
    expect(props.applyAutoBuildResult).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]').textContent).toContain('총예산');
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
