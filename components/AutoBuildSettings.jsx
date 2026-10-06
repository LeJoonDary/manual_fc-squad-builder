import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ExcludedCardVersionsManager } from './ExcludedCardVersionsManager.jsx';
import { excludedCardVersionsStore } from '../utils/excludedCardVersions.js';
import { fetchCandidatePlayers, generateOptimalSquad, getRemainingAutoBuildBudget } from '../utils/autoBuildUtils.ts';

export function AutoBuildSettings({ formation, getTargetBudget, budgetSection, supabase, getSquadSnapshot, applyAutoBuildResult, getCurrentSquad = () => ({}), resetTargetBudget = () => {}, getRoleOptions = () => ({}), openTacticalRoles = () => {} }) {
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
  const [focus, setFocus] = useState('attack');
  const [, refreshContext] = useState(0);
  useEffect(() => {
    const refresh = () => refreshContext(value => value + 1);
    window.addEventListener('auto-build-context-change', refresh);
    return () => window.removeEventListener('auto-build-context-change', refresh);
  }, []);
  const { lockedCost, distributableBudget, unlimited } = getRemainingAutoBuildBudget(
    Math.max(0, Number(getTargetBudget()) || 0), formation, { currentSquad: getCurrentSquad() });
  const [minChemistry, setMinChemistry] = useState(33);
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
      const roleOptions = structuredClone(getRoleOptions());
      const options = { ...roleOptions, currentSquad, squadOvrRange: { ...exclusionSnapshot.squadOvrRange }, excludedCardVersionIds: [...exclusionSnapshot.excludedCardVersionIds], focus, excludeZeroPriceCards: true };
      const candidates = await fetchCandidatePlayers(totalBudget, formation, isThreeBack, supabase, options);
      const result = await generateOptimalSquad(formation, candidates, totalBudget, minChemistry, true, options);
      if (JSON.stringify(getRoleOptions()) !== JSON.stringify(roleOptions)) throw new Error('Role settings changed during the build. Try again.');
      if (excludedCardVersionsStore.getState() !== exclusionSnapshot) {
        throw new Error('Exclusions changed during the build. Try again with the current exclusions.');
      }
      if ((!result.success && result.status !== 'fallback') || (totalBudget > 0 && result.totalCost > totalBudget)) {
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
    setFocus('attack');
    setMinChemistry(33);
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
      <div className="auto-build-modal-grid"><ExcludedCardVersionsManager supabase={supabase} /><button type="button" className="tactical-roles-trigger" aria-haspopup="dialog" onClick={openTacticalRoles}>🎯 Tactical Roles / Playstyles ({Object.values(getRoleOptions().slotRequirements ?? {}).filter(req => req?.role || req?.playstyle).length})</button></div>
        <div id="auto-build-details" className="auto-build-details" hidden={!isAutoBuildSettingsOpen}>
          <div ref={budgetHost} />
          <div className="auto-build-total">Locked Player Cost {lockedCost.toLocaleString('en-US')} C<br />
            {unlimited ? 'Unlimited budget · Prioritize the chemistry target with no price limit' : `Remaining Budget ${distributableBudget.toLocaleString('en-US')} C`}</div>
          <fieldset className="auto-build-focus" disabled={isAutoBuilding}>
            <legend>Squad Focus</legend>
            <div className="auto-build-focus-options">
              {[['attack', '⚡ Attack Focus'], ['balanced', '⚖ Balanced'], ['defense', '🛡 Defense Focus']].map(([value, label]) => (
                <button key={value} type="button" aria-pressed={focus === value} onClick={() => setFocus(value)}>{label}</button>
              ))}
            </div>
          </fieldset>
          <div className="auto-build-range">
            <label htmlFor="min-chemistry">Min Chemistry Target</label>
            <output htmlFor="min-chemistry">{minChemistry} / 33</output>
            <input id="min-chemistry" type="range" min="0" max="33" step="1" value={minChemistry} disabled={isAutoBuilding}
              onChange={event => setMinChemistry(Number(event.target.value))} />
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
