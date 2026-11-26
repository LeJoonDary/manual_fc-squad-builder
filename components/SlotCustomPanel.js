import { getLanguage } from '../src/i18n/languageStore';
import { CUSTOM_POSITIONS, FACE_KEYS, hasCustom } from '../utils/slotCustom.js';
import { getCardFaceStats } from '../utils/cardFaceStats.js';
import { loadCardSkins, skinLabel } from '../utils/cardSkins.js';

export function createSlotCustomPanel({ db, getEntry, change, replace, remove }) {
  const root = document.createElement('section'); root.className = 'slot-custom-panel';
  const text = (ko, en) => getLanguage() === 'ko' ? ko : en;
  const button = (label, action) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = action; return b; };
  const commit = patch => { change({ ...getEntry().customOverrides, ...patch }); reset.disabled = !hasCustom(getEntry().customOverrides); };
  const actions = document.createElement('div'); actions.className = 'slot-custom-actions';
  const reset = button(text('커스텀 초기화', 'Reset Custom'), () => { change({}); render(); });
  function render() {
    const entry = getEntry(); if (!entry) return;
    const custom = entry.customOverrides ?? {}, original = entry.originalCard ?? entry.card;
    root.replaceChildren(); actions.replaceChildren(button(text('선수 교체', 'Replace'), replace), button(text('삭제', 'Remove'), remove), reset);
    reset.disabled = !hasCustom(custom); root.append(actions);
    const title = document.createElement('h3'); title.textContent = 'Quick Custom / Evo'; root.append(title);
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
  }
  render(); return root;
}
