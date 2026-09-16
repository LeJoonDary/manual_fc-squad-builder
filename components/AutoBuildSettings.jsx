import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fetchCandidatePlayers, generateOptimalSquad, getCandidateBudgetPlan, getRemainingAutoBuildBudget } from '../utils/autoBuildUtils.ts';

export function AutoBuildSettings({ formation, getTargetBudget, supabase, getSquadSnapshot, applyAutoBuildResult, getCurrentSquad = () => ({}), resetTargetBudget = () => {} }) {
  const [isAutoBuilding, setIsAutoBuilding] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const buildingRef = useRef(false);
  const [isAutoBuildSettingsOpen, setIsAutoBuildSettingsOpen] = useState(false);
  const [, refreshContext] = useState(0);
  useEffect(() => {
    const refresh = () => refreshContext(value => value + 1);
    window.addEventListener('auto-build-context-change', refresh);
    return () => window.removeEventListener('auto-build-context-change', refresh);
  }, []);
  const { lockedCost, distributableBudget } = getRemainingAutoBuildBudget(
    Math.max(0, Number(getTargetBudget()) || 0), formation, { currentSquad: getCurrentSquad() });
  const initialAllocations = () => {
    const amount = Math.floor(distributableBudget / 3);
    return { FW: amount, MF: amount, DF: distributableBudget - amount * 2 };
  };
  const [allocationState, setAllocationState] = useState(() => ({ basis: distributableBudget, amounts: initialAllocations() }));
  // Preserve the user's proportions when target budget, locks or ownership change.
  const budgetAllocations = allocationState.basis === distributableBudget ? allocationState.amounts
    : allocationState.basis === 0 ? initialAllocations()
    : Object.fromEntries(Object.entries(allocationState.amounts).map(([group, amount]) =>
      [group, Math.floor(amount / allocationState.basis * distributableBudget)]));
  const allocatedTotal = Object.values(budgetAllocations).reduce((sum, value) => sum + value, 0);
  const setBudgetAllocations = amounts => setAllocationState({ basis: distributableBudget, amounts });
  const maximumAmount = group => Math.max(0, distributableBudget - allocatedTotal + budgetAllocations[group]);
  const percentage = amount => distributableBudget > 0 ? amount / distributableBudget * 100 : 0;
  const updateAllocation = (group, amount) => {
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > maximumAmount(group)) {
      setFeedback({ type: 'error', text: '포지션별 예산 합계는 총 잔여 예산을 넘을 수 없습니다.' });
      return;
    }
    setFeedback(null);
    setBudgetAllocations({ ...budgetAllocations, [group]: amount });
  };
  const [minChemistry, setMinChemistry] = useState(33);
  const [considerManager, setConsiderManager] = useState(true);
  const [specialMode, setSpecialMode] = useState('unlimited');
  const [specialCount, setSpecialCount] = useState(1);
  const isThreeBack = formation.startsWith('3');

  async function handleAutoBuild() {
    if (buildingRef.current) return;
    buildingRef.current = true;
    setIsAutoBuilding(true);
    setFeedback(null);
    try {
      const totalBudget = getTargetBudget();
      const currentSquad = getCurrentSquad();
      if (!Number.isFinite(totalBudget) || totalBudget < 0) {
        throw new Error('자동 완성을 실행하려면 0 이상의 총예산을 입력해 주세요.');
      }
      const snapshot = getSquadSnapshot();
      const options = { currentSquad, budgetAllocations: { ...budgetAllocations }, maxSpecialCards: specialMode === 'unlimited' ? null : specialMode === 'none' ? 0 : specialCount };
      getCandidateBudgetPlan(totalBudget, budgetAllocations, formation, isThreeBack, options);
      const candidates = await fetchCandidatePlayers(totalBudget, { ...budgetAllocations }, formation, isThreeBack, supabase, options);
      const result = await generateOptimalSquad(formation, candidates, totalBudget, minChemistry, considerManager, options);
      if (!result.success && result.status !== 'fallback') {
        throw new Error('조건을 만족하는 스쿼드를 찾지 못했습니다. 예산을 늘리거나 케미스트리 조건을 낮춰주세요.');
      }
      applyAutoBuildResult(result, { snapshot, formation, totalBudget });
      setFeedback(result.status === 'fallback' ? { type: 'warning', text: `저가 선수로 빈자리를 채웠습니다. 총비용 ${result.totalCost.toLocaleString('en-US')} C · ${result.totalCost > totalBudget ? `예산 ${(result.totalCost - totalBudget).toLocaleString('en-US')} C 초과` : '총예산 이내'} · 케미스트리 ${result.totalChemistry}/33 (목표 ${minChemistry})` } : { type: 'success', text: `스쿼드 구성을 완료했습니다. 총비용 ${result.totalCost.toLocaleString('en-US')} C · 케미스트리 ${result.totalChemistry}/33` });
    } catch (error) {
      setFeedback({ type: 'error', text: error instanceof Error ? error.message : '자동 완성 중 오류가 발생했습니다. 다시 시도해 주세요.' });
    } finally {
      buildingRef.current = false;
      setIsAutoBuilding(false);
    }
  }

  function resetSettings() {
    if (buildingRef.current) return;
    resetTargetBudget();
    const remaining = getRemainingAutoBuildBudget(getTargetBudget(), formation, { currentSquad: getCurrentSquad() }).distributableBudget;
    const amount = Math.floor(remaining / 3);
    setAllocationState({ basis: remaining, amounts: { FW: amount, MF: amount, DF: remaining - amount * 2 } });
    setMinChemistry(33);
    setConsiderManager(true);
    setSpecialMode('unlimited');
    setSpecialCount(1);
    setFeedback(null);
  }

  return (
    <section className="auto-build-settings" aria-labelledby="auto-build-title">
      <h2 id="auto-build-title">
        <button type="button" className="auto-build-heading"
          aria-expanded={isAutoBuildSettingsOpen} aria-controls="auto-build-details"
          onClick={() => setIsAutoBuildSettingsOpen(previous => !previous)}>
          <span><span className="auto-build-eyebrow">AUTO BUILD</span>자동 완성 설정</span>
          <span className="auto-build-chevron" aria-hidden="true">{isAutoBuildSettingsOpen ? '∧' : '∨'}</span>
        </button>
      </h2>
      {isAutoBuildSettingsOpen && (
        <div id="auto-build-details" className="auto-build-details">
          <div className="auto-build-total">락 선수 비용 {lockedCost.toLocaleString('en-US')} C<br />
            총 잔여 예산 {distributableBudget.toLocaleString('en-US')} C · 배분 {allocatedTotal.toLocaleString('en-US')} C</div>
          <fieldset className="auto-build-ratios" aria-describedby="auto-build-position-help" disabled={isAutoBuilding}>
            <legend>포지션별 예산 배분</legend>
            {Object.entries({ FW: '공격 (FW)', MF: '미드필드 (MF)', DF: '수비 (DF + GK)' }).map(([group, label]) => (
              <div className="auto-build-range" key={group}>
                <label htmlFor={`budget-allocation-${group}`}>{label}</label>
                <output htmlFor={`budget-ratio-${group}`}>{percentage(budgetAllocations[group]).toFixed(1)}%</output>
                <input id={`budget-ratio-${group}`} type="range" min="0" step="any"
                  aria-label={`${label} 예산 비율`} aria-valuetext={`${percentage(budgetAllocations[group]).toFixed(1)}%`}
                  max={percentage(maximumAmount(group))} value={percentage(budgetAllocations[group])}
                  disabled={isAutoBuilding || distributableBudget === 0}
                  onChange={event => updateAllocation(group, Math.min(maximumAmount(group), Math.round(Number(event.target.value) / 100 * distributableBudget)))} />
                <input id={`budget-allocation-${group}`} type="text" inputMode="numeric"
                  aria-label={`${label} 예산 코인`} value={budgetAllocations[group].toLocaleString('en-US')}
                  onChange={event => {
                    const text = event.target.value.replace(/,/g, '').trim();
                    if (!/^\d*$/.test(text)) return;
                    updateAllocation(group, Number(text));
                  }} />
              </div>
            ))}
          </fieldset>
          <div id="auto-build-position-help" className="auto-build-help">
            <span aria-hidden="true">ⓘ</span>
            <div>
              <p>락 선수를 제외한 빈자리의 후보 검색 예산입니다. 최종 조합에서는 그룹 간 예산을 유연하게 사용합니다.</p>
              <p>※ 중앙 공격형 미드필더(CAM)는 공격수(FW) 예산에 포함됩니다.</p>
              <p>{isThreeBack
                ? '※ 현재 3백 포메이션입니다. 측면 미드필더(LM, RM)는 육각형 스탯 기반의 윙백으로 평가되어 미드필더(MF) 예산에 포함됩니다.'
                : '※ 현재 4백 포메이션입니다. 측면 미드필더(LM, RM)는 공격적인 윙어로 평가되어 공격수(FW) 예산에 포함됩니다.'}</p>
            </div>
          </div>
          <div className="auto-build-range">
            <label htmlFor="min-chemistry">최소 목표 케미스트리</label>
            <output htmlFor="min-chemistry">{minChemistry} / 33</output>
            <input id="min-chemistry" type="range" min="0" max="33" step="1" value={minChemistry} disabled={isAutoBuilding}
              onChange={event => setMinChemistry(Number(event.target.value))} />
          </div>
          <label className="filter-switch auto-build-manager-switch">
            <input type="checkbox" checked={considerManager} disabled={isAutoBuilding} onChange={event => setConsiderManager(event.target.checked)} />
            <span className="filter-switch-control" aria-hidden="true" />
            <span>감독 효과 포함</span>
          </label>
          <div className="auto-build-special">
            <label htmlFor="auto-build-special-mode">아이콘 / 히어로 제한</label>
            <select id="auto-build-special-mode" value={specialMode} disabled={isAutoBuilding} onChange={event => setSpecialMode(event.target.value)}>
              <option value="unlimited">무제한</option>
              <option value="limited">최대 N명</option>
              <option value="none">사용 안 함</option>
            </select>
            {specialMode === 'limited' && <label>최대 인원
              <input aria-label="아이콘 / 히어로 최대 인원" type="number" min="1" max="11" step="1" value={specialCount} disabled={isAutoBuilding}
                onChange={event => setSpecialCount(Math.max(1, Math.min(11, Math.round(Number(event.target.value) || 1))))} />명
            </label>}
          </div>
          <button type="button" className="auto-build-reset" disabled={isAutoBuilding} onClick={resetSettings}>설정 초기화</button>
        </div>
      )}
      <button type="button" className="auto-build-button" disabled={isAutoBuilding} aria-busy={isAutoBuilding} onClick={handleAutoBuild}>
        {isAutoBuilding ? <><span className="auto-build-spinner" aria-hidden="true" /> 스쿼드 구성 중...</> : '🚀 스쿼드 자동 완성'}
      </button>
      {feedback && <p className={`auto-build-feedback is-${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}
    </section>
  );
}

export function mountAutoBuildSettings(container, initialFormation, getTargetBudget, services) {
  const root = createRoot(container);
  // Re-render the same component so formation changes preserve the user's settings.
  const updateFormation = formation => root.render(<AutoBuildSettings formation={formation} getTargetBudget={getTargetBudget} {...services} />);
  updateFormation(initialFormation);
  return updateFormation;
}
