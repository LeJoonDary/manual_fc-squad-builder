import { hasDesktopPointer, DESKTOP_POINTER_QUERY } from '../utils/desktopPointer.js';
import { getCardBackground } from '../utils/cardBackground.js';
import { CardCostBadge } from './CardCostBadge';
import { squadPresets } from '../src/data/squadPresets';
import { getLanguage, subscribeLanguage } from '../src/i18n/languageStore';
import { EXPLORE_DRAG_TYPE, explorePositions, primaryPosition, getPrimaryMetaScore } from '../utils/exploreSquad.js';

export function createExplorePanel({ mount, load, preset, openDetail, openReview, drag, endDrag, close, name, image, rating }) {
  const text = (ko, en) => getLanguage() === 'ko' ? ko : en;
  mount.classList.add('explore-panel'); mount.id = 'explore-panel';
  let tab = 'new', request = 0, cards = [], loading = false, failed = false;
  const cache = new Map();
  const heading = document.createElement('header');
  const title = document.createElement('strong');
  const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.textContent = '◀'; dismiss.onclick = close;
  heading.append(title, dismiss);
  const presets = document.createElement('div'); presets.className = 'explore-presets grid-cols-3 gap-1.5';
  const tabs = document.createElement('div'); tabs.className = 'explore-tabs';
  const list = document.createElement('div'); list.className = 'explore-list';
  const grid = document.createElement('div'); grid.className = 'explore-grid grid-cols-2 gap-2';
  const more = document.createElement('button'); more.type = 'button'; more.className = 'explore-message explore-load-more';
  more.onclick = () => refresh(true);
  list.append(grid, more);
  grid.setAttribute('aria-live', 'polite');
  mount.append(heading, presets, tabs, list);
  async function refresh(append = false) {
    const key = tab;
    if (!cache.has(key)) cache.set(key, { cards: [], loaded: false, hasMore: true, pending: null });
    const state = cache.get(key);
    if (append && (loading || !state.hasMore || state.cards.length >= 120)) return;
    const id = ++request; cards = state.cards; failed = false;
    if (!append && state.loaded) { loading = false; render(); return; }
    loading = true; render();
    try {
      if (!state.pending) state.pending = Promise.resolve().then(() => load(key, state.cards.length)).then(result => {
        state.cards = [...state.cards, ...result].slice(0, 120);
        state.loaded = true; state.hasMore = result.length === 30 && state.cards.length < 120;
      }).finally(() => { state.pending = null; });
      await state.pending;
      if (id === request) cards = state.cards;
    }
    catch { if (id === request) failed = true; }
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
    more.hidden = !cards.length || (!failed && !cache.get(tab)?.hasMore);
    more.disabled = loading;
    more.textContent = loading ? text('불러오는 중…', 'Loading…') : failed ? text('조회 실패 · 다시 시도', 'Failed · Retry') : text(`더 보기 (${cards.length} / 120)`, `Load More (${cards.length} / 120)`);
    if (!cards.length) {
      const message = document.createElement('button'); message.type = 'button'; message.className = 'explore-message';
      message.textContent = loading ? text('불러오는 중…', 'Loading…') : failed ? text('조회 실패 · 다시 시도', 'Failed · Retry') : text('등록된 카드가 없습니다', 'No cards found');
      message.disabled = !failed; message.onclick = () => refresh(); grid.append(message); return;
    }
    for (const card of cards) {
      const tile = document.createElement('button'); tile.type = 'button'; tile.className = 'explore-tile'; tile.draggable = hasDesktopPointer();
      tile.title = `${name(card)} · ${explorePositions(card).join(' / ')}`;
      const backgroundUrl = (card.raw?.background_url || card.background_url) ? getCardBackground(card) : '';
      if (backgroundUrl) {
        const background = document.createElement('img'); background.className = 'explore-card-background';
        background.src = backgroundUrl; background.alt = ''; background.draggable = false; background.loading = 'lazy'; background.decoding = 'async'; tile.append(background);
      }
      const overlay = document.createElement('span'); overlay.className = 'explore-card-shade'; tile.append(overlay);
      const score = getPrimaryMetaScore(card);
      if (score !== null) {
        const meta = document.createElement('span'); meta.className = 'explore-meta'; meta.textContent = `⚡ ${score}`;
        meta.setAttribute('aria-label', `${primaryPosition(card)} Meta Score ${score}`); tile.append(meta);
      }
      const thumbnail = document.createElement('img'); thumbnail.className = `explore-portrait${['SPECIAL_HEADSHOT', 'NORMAL'].includes(String(card.card_type ?? card.raw?.card_type ?? '').toUpperCase()) ? ' is-headshot' : ''}`; thumbnail.src = image(card); thumbnail.alt = ''; thumbnail.draggable = false; thumbnail.loading = 'lazy';
      thumbnail.decoding = 'async';
      const info = document.createElement('span'); info.className = 'explore-card-info';
      const badge = document.createElement('b'); badge.textContent = `${rating(card)} · ${primaryPosition(card)}`;
      const playerName = document.createElement('span'); playerName.textContent = name(card);
      const price = document.createElement('small'); price.append(CardCostBadge(card, { coinIcon: true }));
      info.append(badge);
      const reviews = card.card_reviews ?? card.raw?.card_reviews;
      const review = (Array.isArray(reviews) ? reviews : [reviews]).find(review => /^[\w-]{11}$/.test(review?.youtube_video_id ?? ''));
      if (review) {
        const reviewBadge = document.createElement('span'); reviewBadge.className = 'explore-review-badge';
        reviewBadge.textContent = '▶ Review'; reviewBadge.title = 'Gameplay Review';
        reviewBadge.tabIndex = 0; reviewBadge.setAttribute('role', 'button');
        for (const type of ['pointerdown', 'mousedown', 'dragstart']) reviewBadge.addEventListener(type, event => {
          event.stopPropagation(); event.preventDefault();
        });
        reviewBadge.onkeydown = event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); openReview?.(review); }
        };
        reviewBadge.onkeyup = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); } };
        info.append(reviewBadge);
      }
      info.append(playerName, price); tile.append(thumbnail, info);
      let dragged = false;
      let suppressClickUntil = 0;
      tile.ondragstart = event => { if (event.target.closest('.explore-review-badge') || !hasDesktopPointer()) { event.preventDefault(); return; } dragged = true; event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData(EXPLORE_DRAG_TYPE, JSON.stringify({ source: 'explore_panel', id: card.id })); drag(card); };
      tile.ondragend = () => { endDrag(); dragged = false; suppressClickUntil = Date.now() + 350; };
      tile.onclick = event => {
        if (event.target.closest('.explore-review-badge')) { event.preventDefault(); event.stopPropagation(); openReview?.(review); return; }
        event.stopPropagation(); if (!dragged && Date.now() >= suppressClickUntil) openDetail(card);
      }; grid.append(tile);
    }
  }
  subscribeLanguage(render); void refresh();
}

if (typeof window !== 'undefined' && window.matchMedia) window.matchMedia(DESKTOP_POINTER_QUERY).addEventListener('change', () => {
  document.querySelectorAll('.explore-tile').forEach(tile => { tile.draggable = hasDesktopPointer(); });
});
