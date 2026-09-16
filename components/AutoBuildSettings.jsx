import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { redistributeBudgetRatios } from '../utils/autoBuild.js';
import { fetchCandidatePlayers, generateOptimalSquad } from '../utils/autoBuildUtils.ts';

export function AutoBuildSettings({ formation, getTargetBudget, supabase, getSquadSnapshot, applyAutoBuildResult, getCurrentSquad = () => ({}), resetTargetBudget = () => {} }) {
  const [isAutoBuilding, setIsAutoBuilding] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const buildingRef = useRef(false);
  const [isAutoBuildSettingsOpen, setIsAutoBuildSettingsOpen] = useState(false);
  const [budgetRatios, setBudgetRatios] = useState({ FW: 40, MF: 35, DF: 25 });
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
      if (!Number.isFinite(totalBudget) || totalBudget < 0 || (totalBudget === 0 && !Object.values(currentSquad).some(entry => entry?.isOwned))) {
        throw new Error('자동 완성을 실행하려면 0보다 큰 총예산을 입력해 주세요.');
      }
      const snapshot = getSquadSnapshot();
      const options = { currentSquad, maxSpecialCards: specialMode === 'unlimited' ? null : specialMode === 'none' ? 0 : specialCount };
      const candidates = await fetchCandidatePlayers(totalBudget, { ...budgetRatios }, formation, isThreeBack, supabase, options);
      const result = await generateOptimalSquad(formation, candidates, totalBudget, minChemistry, considerManager, options);
      if (!result.success) {
        throw new Error('조건을 만족하는 스쿼드를 찾지 못했습니다. 예산을 늘리거나 케미스트리 조건을 낮춰주세요.');
      }
      applyAutoBuildResult(result, { snapshot, formation, totalBudget });
      setFeedback({ type: 'success', text: `스쿼드 구성을 완료했습니다. 총비용 ${result.totalCost.toLocaleString('en-US')} C · 케미스트리 ${result.totalChemistry}/33` });
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
    setBudgetRatios({ FW: 40, MF: 35, DF: 25 });
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
          <span className="auto-build-total">합계 100%</span>
          <fieldset className="auto-build-ratios" aria-describedby="auto-build-position-help" disabled={isAutoBuilding}>
            <legend>포지션별 예산 배분</legend>
            {Object.entries({ FW: '공격 (FW)', MF: '미드필드 (MF)', DF: '수비 (DF + GK)' }).map(([group, label]) => (
              <div className="auto-build-range" key={group}>
                <label htmlFor={`budget-ratio-${group}`}>{label}</label>
                <output htmlFor={`budget-ratio-${group}`}>{budgetRatios[group]}%</output>
                <input id={`budget-ratio-${group}`} type="range" min="0" max="100" step="1"
                  value={budgetRatios[group]} aria-valuetext={`${budgetRatios[group]}%`}
                  onChange={event => {
                    const value = event.target.value;
                    setBudgetRatios(previous => redistributeBudgetRatios(previous, group, value));
                  }} />
              </div>
            ))}
          </fieldset>
          <div id="auto-build-position-help" className="auto-build-help">
            <span aria-hidden="true">ⓘ</span>
            <div>
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
