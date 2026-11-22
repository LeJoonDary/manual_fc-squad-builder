import { getCardBackground } from '../utils/cardBackground.js';
import { squadPresets } from '../src/data/squadPresets';
import { getLanguage, subscribeLanguage } from '../src/i18n/languageStore';
import { EXPLORE_DRAG_TYPE, explorePositions, primaryPosition, getPrimaryMetaScore } from '../utils/exploreSquad.js';

export function createExplorePanel({ mount, load, preset, openDetail, drag, endDrag, close, name, image, rating }) {
  const text = (ko, en) => getLanguage() === 'ko' ? ko : en;
  mount.classList.add('explore-panel'); mount.id = 'explore-panel';
  let tab = 'new', request = 0, cards = [], loading = false, failed = false;
  const heading = document.createElement('header');
  const title = document.createElement('strong');
  const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.textContent = '◀'; dismiss.onclick = close;
  heading.append(title, dismiss);
  const presets = document.createElement('div'); presets.className = 'explore-presets grid-cols-3 gap-1.5';
  const tabs = document.createElement('div'); tabs.className = 'explore-tabs';
  const list = document.createElement('div'); list.className = 'explore-list';
  const grid = document.createElement('div'); grid.className = 'explore-grid grid-cols-2 gap-2';
  list.append(grid);
  grid.setAttribute('aria-live', 'polite');
  mount.append(heading, presets, tabs, list);
  async function refresh() {
    const id = ++request; loading = true; failed = false; render();
    try { const result = await load(tab); if (id === request) cards = result; }
    catch { if (id === request) { cards = []; failed = true; } }
    finally { if (id === request) { loading = false; render(); } }
  }
  function render() {
    title.textContent = text('🔥 프리셋 · 최신', '🔥 Presets · New');
    dismiss.setAttribute('aria-label', text('탐색 닫기', 'Close explorer'));
    presets.replaceChildren();
    for (const item of squadPresets) {
      const button = document.createElement('button'); button.type = 'button';
      const label = getLanguage() === 'ko' ? item.labelKo : item.labelEn;
      const tag = document.createElement('strong'); tag.className = 'explore-preset-tag';
      tag.textContent = `${['🔥', '💰', '⚡'][squadPresets.indexOf(item)]} ${item.tag}`;
      const caption = document.createElement('span'); caption.className = 'explore-preset-label'; caption.textContent = label;
      button.title = `${label} · ${item.tag}`;
      button.append(tag, caption);
      button.onclick = async () => { button.disabled = true; try { await preset(item); } finally { button.disabled = false; } };
      presets.append(button);
    }
    tabs.replaceChildren();
    for (const [key, label] of [['new', text('🆕 최신 스페셜', '🆕 New Cards')], ['sbc', text('⚡ SBC·보상', '⚡ SBC & Obj')]]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.setAttribute('aria-pressed', String(tab === key)); button.onclick = () => { tab = key; void refresh(); }; tabs.append(button);
    }
    grid.replaceChildren(); grid.setAttribute('aria-busy', String(loading));
    if (loading || failed || !cards.length) {
      const message = document.createElement('button'); message.type = 'button'; message.className = 'explore-message';
      message.textContent = loading ? text('불러오는 중…', 'Loading…') : failed ? text('조회 실패 · 다시 시도', 'Failed · Retry') : text('등록된 카드가 없습니다', 'No cards found');
      message.disabled = !failed; message.onclick = refresh; grid.append(message); return;
    }
    for (const card of cards) {
      const tile = document.createElement('button'); tile.type = 'button'; tile.className = 'explore-tile'; tile.draggable = true;
      tile.title = `${name(card)} · ${explorePositions(card).join(' / ')}`;
      const backgroundUrl = (card.raw?.background_url || card.background_url) ? getCardBackground(card) : '';
      if (backgroundUrl) {
        const background = document.createElement('img'); background.className = 'explore-card-background';
        background.src = backgroundUrl; background.alt = ''; background.draggable = false; background.loading = 'lazy'; tile.append(background);
      }
      const overlay = document.createElement('span'); overlay.className = 'explore-card-shade'; tile.append(overlay);
      const score = getPrimaryMetaScore(card);
      if (score !== null) {
        const meta = document.createElement('span'); meta.className = 'explore-meta'; meta.textContent = `⚡ ${score}`;
        meta.setAttribute('aria-label', `${primaryPosition(card)} Meta Score ${score}`); tile.append(meta);
      }
      const thumbnail = document.createElement('img'); thumbnail.className = `explore-portrait${['SPECIAL_HEADSHOT', 'NORMAL'].includes(String(card.card_type ?? card.raw?.card_type ?? '').toUpperCase()) ? ' is-headshot' : ''}`; thumbnail.src = image(card); thumbnail.alt = ''; thumbnail.draggable = false; thumbnail.loading = 'lazy';
      const info = document.createElement('span'); info.className = 'explore-card-info';
      const badge = document.createElement('b'); badge.textContent = `${rating(card)} · ${primaryPosition(card)}`;
      const playerName = document.createElement('span'); playerName.textContent = name(card);
      const price = document.createElement('small'); price.textContent = (card.card_type ?? card.raw?.card_type) === 'SPECIAL_SBC' ? 'SBC' : `${Number(card.price ?? 0).toLocaleString('en-US')} C`;
      info.append(badge, playerName, price); tile.append(thumbnail, info);
      let dragged = false;
      let suppressClickUntil = 0;
      tile.ondragstart = event => { dragged = true; event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData(EXPLORE_DRAG_TYPE, JSON.stringify({ source: 'explore_panel', id: card.id })); drag(card); };
      tile.ondragend = () => { endDrag(); dragged = false; suppressClickUntil = Date.now() + 350; };
      tile.onclick = event => { event.stopPropagation(); if (!dragged && Date.now() >= suppressClickUntil) openDetail(card); }; grid.append(tile);
    }
  }
  subscribeLanguage(render); void refresh();
}
