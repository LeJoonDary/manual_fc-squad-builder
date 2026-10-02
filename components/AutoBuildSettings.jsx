import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ExcludedCardVersionsManager } from './ExcludedCardVersionsManager.jsx';
import { excludedCardVersionsStore } from '../utils/excludedCardVersions.js';
import { fetchCandidatePlayers, generateOptimalSquad, getCandidateBudgetPlan, getRemainingAutoBuildBudget } from '../utils/autoBuildUtils.ts';

export function AutoBuildSettings({ formation, getTargetBudget, budgetSection, supabase, getSquadSnapshot, applyAutoBuildResult, getCurrentSquad = () => ({}), resetTargetBudget = () => {} }) {
  const budgetHost = useRef(null);
  useEffect(() => {
    // Retain the existing input node and its budget/progress event listeners.
    if (budgetSection && budgetHost.current) {
      budgetHost.current.append(budgetSection);
      budgetSection.hidden = false;
    }
  }, [budgetSection]);
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
  const { lockedCost, distributableBudget, unlimited } = getRemainingAutoBuildBudget(
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
      setFeedback({ type: 'error', text: 'Position budgets cannot exceed the remaining budget.' });
      return;
    }
    setFeedback(null);
    setBudgetAllocations({ ...budgetAllocations, [group]: amount });
  };
  const [minChemistry, setMinChemistry] = useState(33);
  const [considerManager, setConsiderManager] = useState(true);
  const [excludeZeroPriceCards, setExcludeZeroPriceCards] = useState(true);
  const [specialMode, setSpecialMode] = useState('unlimited');
  const [specialCount, setSpecialCount] = useState(1);
  const isThreeBack = formation.startsWith('3');

  async function handleAutoBuild() {
    if (buildingRef.current) return;
    buildingRef.current = true;
    setIsAutoBuilding(true);
    setFeedback(null);
    try {
      const totalBudget = Number(getTargetBudget() ?? 0);
      const currentSquad = getCurrentSquad();
      if (!Number.isFinite(totalBudget) || totalBudget < 0) {
        throw new Error('Enter a total budget of 0 or more to auto build your squad.');
      }
      const snapshot = getSquadSnapshot();
      const exclusionSnapshot = excludedCardVersionsStore.getState();
      const options = { currentSquad, squadOvrRange: { ...exclusionSnapshot.squadOvrRange }, excludedCardVersionIds: [...exclusionSnapshot.excludedCardVersionIds], budgetAllocations: { ...budgetAllocations }, maxSpecialCards: specialMode === 'unlimited' ? null : specialMode === 'none' ? 0 : specialCount };
      options.excludeZeroPriceCards = excludeZeroPriceCards;
      getCandidateBudgetPlan(totalBudget, budgetAllocations, formation, isThreeBack, options);
      const candidates = await fetchCandidatePlayers(totalBudget, { ...budgetAllocations }, formation, isThreeBack, supabase, options);
      const result = await generateOptimalSquad(formation, candidates, totalBudget, minChemistry, considerManager, options);
      if (excludedCardVersionsStore.getState() !== exclusionSnapshot) {
        throw new Error('Exclusions changed during the build. Try again with the current exclusions.');
      }
      if (!result.success && result.status !== 'fallback') {
        throw new Error('No squad meets your requirements. Increase your budget or lower the chemistry target.');
      }
      applyAutoBuildResult(result, { snapshot, formation, totalBudget });
      setFeedback(result.status === 'fallback' ? { type: 'warning', text: `Built the closest matching squad. Total Cost: ${result.totalCost.toLocaleString('en-US')} C · ${totalBudget === 0 ? 'Unlimited Budget' : result.totalCost > totalBudget ? `${(result.totalCost - totalBudget).toLocaleString('en-US')} C Over Budget` : 'Within Budget'} · Chemistry: ${result.totalChemistry}/33 (Target ${minChemistry})` } : { type: 'success', text: `Squad built successfully! Total Cost: ${result.totalCost.toLocaleString('en-US')} C · Chemistry: ${result.totalChemistry}/33` });
    } catch (error) {
      setFeedback({ type: 'error', text: error instanceof Error ? error.message : 'Auto build failed. Please try again.' });
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
    setExcludeZeroPriceCards(true);
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
          <span><span className="auto-build-eyebrow">AUTO BUILD</span>Auto Build Settings</span>
          <span className="auto-build-chevron" aria-hidden="true">{isAutoBuildSettingsOpen ? '∧' : '∨'}</span>
        </button>
      </h2>
      <ExcludedCardVersionsManager supabase={supabase} />
        <div id="auto-build-details" className="auto-build-details" hidden={!isAutoBuildSettingsOpen}>
          <div ref={budgetHost} />
          <div className="auto-build-total">Locked Player Cost {lockedCost.toLocaleString('en-US')} C<br />
            {unlimited ? 'Unlimited budget · Prioritize the chemistry target with no price limit' : `Remaining Budget ${distributableBudget.toLocaleString('en-US')} C · Allocated ${allocatedTotal.toLocaleString('en-US')} C`}</div>
          <fieldset className="auto-build-ratios" aria-describedby="auto-build-position-help" disabled={isAutoBuilding || unlimited}>
            <legend>Budget Allocation by Position</legend>
            {Object.entries({ FW: 'Attackers (FW)', MF: 'Midfielders (MF)', DF: 'Defenders (DF + GK)' }).map(([group, label]) => (
              <div className="auto-build-range" key={group}>
                <label htmlFor={`budget-allocation-${group}`} title={label}>{group === 'DF' ? 'DF + GK' : group}</label>
                <output htmlFor={`budget-ratio-${group}`}>{unlimited ? 'Unlimited' : `${percentage(budgetAllocations[group]).toFixed(1)}%`}</output>
                <input id={`budget-ratio-${group}`} type="range" min="0" step="any"
                  aria-label={`${label} budget percentage`} aria-valuetext={`${percentage(budgetAllocations[group]).toFixed(1)}%`}
                  max={percentage(maximumAmount(group))} value={percentage(budgetAllocations[group])}
                  disabled={isAutoBuilding || distributableBudget === 0}
                  onChange={event => updateAllocation(group, Math.min(maximumAmount(group), Math.round(Number(event.target.value) / 100 * distributableBudget)))} />
                <input id={`budget-allocation-${group}`} type="text" inputMode="numeric"
                  aria-label={`${label} budget in coins`} value={unlimited ? '' : budgetAllocations[group].toLocaleString('en-US')} placeholder="Unlimited"
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
              <p>Target search budget for open positions. The builder dynamically balances total budget across selected groups.</p>
              <p>Attacking midfielders (CAM) are budgeted as attackers (FW).</p>
              <p>{isThreeBack
                ? 'Currently using a 3-back formation. Wide midfielders (LM/RM) are evaluated as wing-backs using their face stats and budgeted as midfielders (MF).'
                : 'Currently using a 4-back formation. Wide midfielders (LM/RM) are budgeted as attackers (FW).'}</p>
            </div>
          </div>
          <div className="auto-build-range">
            <label htmlFor="min-chemistry">Min Chemistry Target</label>
            <output htmlFor="min-chemistry">{minChemistry} / 33</output>
            <input id="min-chemistry" type="range" min="0" max="33" step="1" value={minChemistry} disabled={isAutoBuilding}
              onChange={event => setMinChemistry(Number(event.target.value))} />
          </div>
          <label className="filter-switch auto-build-price-switch">
            <input id="exclude-zero-price-cards" type="checkbox" checked={excludeZeroPriceCards} disabled={isAutoBuilding} onChange={event => setExcludeZeroPriceCards(event.target.checked)} />
            <span className="filter-switch-control" aria-hidden="true" />
            <span>Exclude 0-Coin Cards (Untradeable / SBC)</span>
          </label>
          <label className="filter-switch auto-build-manager-switch">
            <input type="checkbox" checked={considerManager} disabled={isAutoBuilding} onChange={event => setConsiderManager(event.target.checked)} />
            <span className="filter-switch-control" aria-hidden="true" />
            <span>Include Manager Boost</span>
          </label>
          <div className="auto-build-special">
            <label htmlFor="auto-build-special-mode">Icon / Hero Limit</label>
            <select id="auto-build-special-mode" value={specialMode} disabled={isAutoBuilding} onChange={event => setSpecialMode(event.target.value)}>
              <option value="unlimited">Unlimited</option>
              <option value="limited">Custom Limit</option>
              <option value="none">None</option>
            </select>
            {specialMode === 'limited' && <label>Max Players
              <input aria-label="Maximum Icons / Heroes" type="number" min="1" max="11" step="1" value={specialCount} disabled={isAutoBuilding}
                onChange={event => setSpecialCount(Math.max(1, Math.min(11, Math.round(Number(event.target.value) || 1))))} /> players
            </label>}
          </div>
        </div>
      <div className={`auto-build-actions${isAutoBuildSettingsOpen ? ' is-expanded' : ''}`}>
        {isAutoBuildSettingsOpen && <button type="button" className="auto-build-reset" disabled={isAutoBuilding} onClick={resetSettings}>Reset Settings</button>}
        <button type="button" className="auto-build-button" disabled={isAutoBuilding} aria-busy={isAutoBuilding} onClick={handleAutoBuild}>
          {isAutoBuilding ? <><span className="auto-build-spinner" aria-hidden="true" /> Building Squad...</> : '🚀 Auto Build Squad'}
        </button>
      </div>
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
