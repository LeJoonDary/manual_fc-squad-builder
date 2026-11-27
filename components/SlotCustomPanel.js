import { tacticalPlaystyleGroups, playstyleCategoryLabel, appendPlaystyleImage } from './PlaystylesGridSelector.js';
import { fetchPlaystyleOptions } from '../utils/playstyleFilters.js';
import { normalizePlaystyles } from '../utils/normalizePlaystyles.js';
import { savedEvosStore, evoCardId } from '../utils/savedEvos.js';
import { createSavedEvosList } from './SavedEvosList.js';
import { getLanguage, subscribeLanguage } from '../src/i18n/languageStore';
import { CUSTOM_POSITIONS, FACE_KEYS, hasCustom } from '../utils/slotCustom.js';
import { getCardFaceStats } from '../utils/cardFaceStats.js';
import { loadCardSkins, skinLabel } from '../utils/cardSkins.js';

export function createSlotCustomPanel({ db, getEntry, change, replace, remove, loadEvo, position, unavailable, onDeleted }) {
  let playstyleOptions;
  const root = document.createElement('section'); root.className = 'slot-custom-panel';
  const text = (ko, en) => getLanguage() === 'ko' ? ko : en;
  const button = (label, action) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = action; return b; };
  const commit = patch => { change({ ...getEntry().customOverrides, ...patch }); syncSave(); };
  const actions = document.createElement('div'); actions.className = 'slot-custom-actions';
  const reset = button(text('커스텀 초기화', 'Reset Custom'), () => { change({}); render(); });
  const feedback = document.createElement('p'); feedback.setAttribute('role', 'status');
  let saveResult;
  const renderFeedback = () => {
    feedback.textContent = !saveResult ? '' : saveResult === 'saved' ? text('저장 완료!', 'Saved!') : saveResult === 'full'
      ? text('커스텀 카드는 최대 10개까지 저장할 수 있습니다. 기존 커스텀 카드를 삭제해 주세요.', 'You can save up to 10 Custom Cards. Delete one first.')
      : text('저장하지 못했습니다. 브라우저 저장소를 확인해 주세요.', 'Unable to save. Check browser storage.');
  };
  const saved = document.createElement('details');
  const save = button('', () => {
    const entry = getEntry();
    saveResult = savedEvosStore.save(entry.originalCard ?? entry.card, entry.customOverrides);
    renderFeedback();
    syncSave();
  });
  function syncSave() {
    const entry = getEntry(); if (!entry) return;
    reset.disabled = !hasCustom(entry.customOverrides);
    save.disabled = reset.disabled || !savedEvosStore.loaded;
    save.textContent = savedEvosStore.entries.some(item => item.id === evoCardId(entry.originalCard ?? entry.card)) ? text('커스텀 업데이트','Update Custom') : text('커스텀 저장','Save Custom');
  }
  function renderSaved() {
    const summary = document.createElement('summary'); summary.className = 'slot-custom-accordion-heading';
    summary.textContent = text(`저장된 커스텀 카드 (${savedEvosStore.entries.length}/10)`, `Saved Custom Cards (${savedEvosStore.entries.length}/10)`);
    const savedArrow = document.createElement('span'); savedArrow.textContent = '⌄'; savedArrow.setAttribute('aria-hidden', 'true'); summary.append(savedArrow);
    saved.replaceChildren(summary, createSavedEvosList({ position, unavailable, onDeleted: item => { onDeleted?.(item); if (root.isConnected) renderSaved(); }, select: item => { loadEvo(item); render(); } }));
    syncSave();
  }
  function render() {
    const entry = getEntry(); if (!entry) return;
    renderFeedback();
    const custom = entry.customOverrides ?? {}, original = entry.originalCard ?? entry.card;
    root.replaceChildren(); actions.replaceChildren(button(text('선수 교체', 'Replace'), replace), save, reset);
    reset.textContent = text('커스텀 초기화', 'Reset Custom'); syncSave(); root.append(actions, feedback);
    const title = document.createElement('h3'); title.textContent = text('카드 커스텀', 'Custom Card'); root.append(title);
    const toggle = button(text('3케미 고정', '3 Chem Fix'), () => {
      const checked = toggle.getAttribute('aria-checked') !== 'true';
      toggle.setAttribute('aria-checked', String(checked)); commit({ forceFullChem: checked });
    });
    toggle.className = 'slot-chem-switch'; toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-checked', String(custom.forceFullChem === true));
    const track = document.createElement('span'); track.className = 'slot-chem-switch-track'; track.setAttribute('aria-hidden','true'); toggle.prepend(track); root.append(toggle);
    const positions = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = text('보조 포지션 추가', '+ Alt Positions'); summary.className = 'slot-custom-accordion-heading';
    const positionArrow = document.createElement('span'); positionArrow.textContent = '⌄'; positionArrow.setAttribute('aria-hidden','true'); summary.append(positionArrow); positions.append(summary);
    const chips = document.createElement('div'); chips.className = 'slot-custom-positions';
    const existing = new Set([original.primary_position, original.position, ...(original.secondary_positions ?? []), ...(original.altPositions ?? []), ...(original.card_positions ?? []).map(p => p.positions?.name)]);
    for (const position of CUSTOM_POSITIONS) {
      const b = button(position, () => { const added = new Set(getEntry().customOverrides?.addedPositions ?? []); added.has(position) ? added.delete(position) : added.add(position); commit({ addedPositions: [...added] }); b.setAttribute('aria-pressed', String(added.has(position))); });
      b.disabled = existing.has(position); b.setAttribute('aria-pressed', String(existing.has(position) || custom.addedPositions?.includes(position) || false)); chips.append(b);
    }
    positions.append(chips); root.append(positions);
    const heading = button(text('카드 배경 · 스탯 커스텀','Appearance & Stats'), () => setExpanded(appearance.hidden));
    heading.className = 'slot-custom-appearance-toggle slot-custom-accordion-heading'; heading.setAttribute('aria-expanded','false');
    const arrow = document.createElement('span'); arrow.textContent = '⌄'; arrow.setAttribute('aria-hidden','true'); heading.append(arrow);
    const appearance = document.createElement('div'); appearance.className = 'slot-custom-appearance'; appearance.id = 'slot-custom-appearance'; appearance.hidden = true;
    heading.setAttribute('aria-controls', appearance.id); root.append(heading, appearance);
    const skinHeading = document.createElement('h3'); skinHeading.textContent = text('카드 배경', 'Card Background'); appearance.append(skinHeading);
    const search = document.createElement('input'); search.type = 'search'; search.placeholder = text('배경 검색...','Search skin...'); search.setAttribute('aria-label', search.placeholder); appearance.append(search);
    const skins = document.createElement('div'); skins.className = 'slot-custom-skins'; appearance.append(skins);
    let options = [];
    const renderSkins = () => {
      skins.replaceChildren(button(text('원본','Original'), () => { commit({ backgroundUrl: null, versionLabel: null }); renderSkins(); }));
      for (const skin of options.filter(s => skinLabel(s.version).toLowerCase().includes(search.value.toLowerCase()))) {
        const b = button('', () => { commit({ backgroundUrl: skin.background_url, versionLabel: skin.version }); renderSkins(); });
        b.setAttribute('aria-pressed', String(getEntry().customOverrides?.backgroundUrl === skin.background_url));
        const img = document.createElement('img'); img.src = skin.background_url; img.alt = ''; img.loading = 'lazy';
        const name = document.createElement('span'); name.textContent = skinLabel(skin.version); b.title = name.textContent; b.append(img, name); skins.append(b);
      }
    };
    search.oninput = renderSkins; renderSkins();
    let loaded = false;
    async function setExpanded(expanded) {
      appearance.hidden = !expanded; heading.setAttribute('aria-expanded', String(expanded));
      if (!expanded || loaded) return; loaded = true;
      try { options = await loadCardSkins(db); if (appearance.isConnected) renderSkins(); }
      catch { loaded = false; skins.append(button(text('다시 불러오기','Retry skins'), () => setExpanded(true))); }
    }
    const stats = document.createElement('div'); stats.className = 'slot-custom-stats'; appearance.append(stats);
    const skills = document.createElement('div'); skills.className = 'slot-custom-stats slot-custom-skills'; appearance.append(skills);
    const face = getCardFaceStats(entry.card);
    for (const [key, caption, value, max] of [['overall','OVR',entry.card.overall,99], ...FACE_KEYS.map((key,i) => [key,face[i][0],face[i][1],99]), ['sm','SM',entry.card.sm,5], ['wf','WF',entry.card.wf,5]]) {
      const label = document.createElement('label'); label.textContent = caption;
      const input = document.createElement('input'); input.type = 'number'; input.inputMode = 'numeric'; input.min = '1'; input.max = String(max); input.step = '1'; input.value = value ?? ''; input.setAttribute('aria-label',caption);
      input.onchange = () => {
        const value = input.value === '' ? undefined : Math.max(1, Math.min(max, Math.round(Number(input.value))));
        if (value !== undefined && !Number.isFinite(value)) return;
        if (FACE_KEYS.includes(key)) commit({ faceStats: { ...getEntry().customOverrides?.faceStats, [key]: value } }); else commit({ [key]: value });
        input.value = value ?? '';
      };
      label.append(input); (key === 'sm' || key === 'wf' ? skills : stats).append(label);
    }
    const traits = document.createElement('details');
    const traitsHeading = document.createElement('summary'); traitsHeading.className = 'slot-custom-accordion-heading';
    traitsHeading.textContent = text('플레이스타일', 'PlayStyles');
    const traitsArrow = document.createElement('span'); traitsArrow.textContent = '⌄'; traitsArrow.setAttribute('aria-hidden', 'true'); traitsHeading.append(traitsArrow);
    const traitHeader = document.createElement('div'); traitHeader.className = 'slot-custom-trait-header';
    const hint = document.createElement('span'); hint.textContent = text('클릭: 없음 → 일반 → PS+', 'Tap: None → Silver → PS+');
    const traitStatus = document.createElement('span'); traitStatus.setAttribute('aria-live', 'polite');
    traitHeader.append(hint, traitStatus);
    const traitGrid = document.createElement('div'); traitGrid.className = 'slot-custom-trait-grid';
    const baseStyles = normalizePlaystyles(original, original.raw, Array.isArray(original.raw?.players) ? original.raw.players[0] : original.raw?.players);
    const selection = () => getEntry().customOverrides?.playstyles ?? (playstyleOptions ?? []).flatMap(option => {
      const matches = baseStyles.filter(style => style.name === option.name);
      return matches.length ? [{ playstyle_id: Number(option.id), name: option.name, is_plus: matches.some(style => style.isPlus), image_url: option.image_url, image_url_plus: option.image_url_plus }] : [];
    });
    function renderTraits() {
      traitGrid.replaceChildren();
      traitStatus.textContent = text(`선택: ${selection().length}`, `Selected: ${selection().length}`);
      for (const { category, items } of tacticalPlaystyleGroups(playstyleOptions ?? [])) {
        const row = document.createElement('div'); row.className = 'slot-custom-trait-row';
        const label = document.createElement('span'); label.className = 'slot-custom-trait-category'; label.textContent = playstyleCategoryLabel(category);
        const icons = document.createElement('div'); icons.className = 'slot-custom-trait-icons';
        for (const option of items) {
          const current = () => selection().find(style => style.playstyle_id === Number(option.id));
          const stateLabel = () => current() ? current().is_plus ? 'PS+' : text('일반', 'Silver') : text('없음', 'None');
          const showStatus = () => { traitStatus.textContent = `${option.name} · ${stateLabel()}`; };
          const chip = button('', () => {
            const previous = current();
            const next = selection().filter(style => style.playstyle_id !== Number(option.id));
            if (!previous || !previous.is_plus) next.push({ playstyle_id: Number(option.id), name: option.name, is_plus: Boolean(previous), image_url: option.image_url, image_url_plus: option.image_url_plus });
            commit({ playstyles: next }); refreshChip(); showStatus();
          });
          chip.dataset.playstyleId = String(option.id);
          const face = document.createElement('span'); face.className = 'slot-custom-trait-face';
          const tooltip = document.createElement('span'); tooltip.className = 'slot-custom-trait-tooltip'; tooltip.setAttribute('role', 'tooltip'); tooltip.textContent = option.name;
          function refreshChip() {
            const selected = current();
            chip.className = `slot-custom-trait${selected ? selected.is_plus ? ' is-plus' : ' is-normal' : ''}`;
            chip.setAttribute('aria-pressed', String(Boolean(selected)));
            chip.setAttribute('aria-label', `${option.name}: ${stateLabel()}`);
            face.replaceChildren(); face.classList.remove('is-unavailable'); appendPlaystyleImage(face, option, Boolean(selected?.is_plus));
          }
          refreshChip(); chip.append(face, tooltip);
          chip.addEventListener('pointerenter', showStatus); chip.addEventListener('focus', showStatus);
          icons.append(chip);
        }
        row.append(label, icons); traitGrid.append(row);
      }
    }
    let loadingTraits = false;
    async function loadTraits() {
      if (loadingTraits) return;
      if (playstyleOptions) { renderTraits(); return; }
      loadingTraits = true; traitGrid.textContent = text('불러오는 중…', 'Loading…');
      try { playstyleOptions = await fetchPlaystyleOptions(db); renderTraits(); }
      catch { traitGrid.replaceChildren(button(text('다시 불러오기', 'Retry PlayStyles'), loadTraits)); }
      finally { loadingTraits = false; }
    }
    traits.ontoggle = () => { if (traits.open) loadTraits(); };
    traits.append(traitsHeading, traitHeader, traitGrid); root.append(traits);
    renderSaved(); root.append(saved);
  }
  const unsubscribeStore = savedEvosStore.subscribe(renderSaved);
  const unsubscribeLanguage = subscribeLanguage(render);
  root.dispose = () => { saved.querySelector('.saved-evos-list')?.resetDeleteConfirmation?.(); unsubscribeStore(); unsubscribeLanguage(); };
  render(); return root;
}
