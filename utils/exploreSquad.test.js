import { readFileSync } from 'node:fs';
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { initialSquadPanel, nextSquadPanel, placeExplorePlayer, findExploreSlot, fetchExploreCards, EXPLORE_DRAG_TYPE, getPrimaryMetaScore, pitchPanelAction, EXPLORE_CARD_SELECT } from './exploreSquad.js';
import { squadPresets } from '../src/data/squadPresets';
import { decodeSquadSharePayload } from './squadShareUtils';
import { loadSharedSquadCards } from './squadShareHydration.js';
import { createExplorePanel } from '../components/ExplorePanel.js';
const card = { id: 20, player_id: 7, primary_position: 'ST', alt_positions: ['LW'] };
describe('explorer panel transitions', () => {
  it('opens the correct panel including empty or invalid shared codes', () => {
    expect(initialSquadPanel('')).toBe('explore');
    expect(initialSquadPanel('?s=abc')).toBe('build');
    expect(initialSquadPanel('?s=')).toBe('build');
    for (const action of ['select', 'card-action', 'control', 'preset', 'close', 'build']) expect(nextSquadPanel('explore', action)).toBe('build');
    for (const action of ['drop', 'pitch', 'resize']) expect(nextSquadPanel('explore', action)).toBe('explore');
    expect(nextSquadPanel('build', 'explore')).toBe('explore');
  });
});
describe('explorer placement', () => {
  it('locks, replaces and moves the same person including another card version', () => {
    const squad = { LS: { card: { ...card, id: 10 }, isLocked: true }, RS: { card: { id: 90, player_id: 9 } } };
    const next = placeExplorePlayer(squad, 'RS', card);
    expect(next.LS).toBeNull(); expect(next.RS).toEqual({ card, isLocked: true, isOwned: false });
    expect(squad.LS.card.id).toBe(10);
    expect(placeExplorePlayer({ LW: { card } }, 'LS', card).LW).toBeNull();
  });
  it('rejects incompatible slots without mutation', () => {
    const squad = { CB: null }; expect(placeExplorePlayer(squad, 'CB', card)).toBeNull(); expect(squad).toEqual({ CB: null });
  });
  it('prefers primary empty slots before alternatives and never replaces on tap', () => {
    expect(findExploreSlot({}, ['LW', 'LS'], card)).toBe('LS');
    expect(findExploreSlot({ LS: { card } }, ['LW', 'LS'], card)).toBe('LW');
    expect(findExploreSlot({ LS: { card }, LW: { card } }, ['LW', 'LS'], card)).toBeUndefined();
  });
});
it('queries the newest 30 cards with live prices and tab filters', async () => {
  const query = {}; for (const method of ['select', 'not', 'or', 'order']) query[method] = vi.fn(() => query);
  query.limit = vi.fn(async () => ({ data: [{ id: 1, price: 68000 }] })); const db = { from: vi.fn(() => query) };
  expect(await fetchExploreCards(db, 'new')).toEqual([{ id: 1, price: 68000 }]);
  expect(query.select).toHaveBeenCalledWith(EXPLORE_CARD_SELECT);
  expect(EXPLORE_CARD_SELECT).toContain('card_positions(is_primary,meta_score,positions(name))');
  expect(query.not).toHaveBeenCalledWith('card_type', 'in', expect.stringContaining('NORMAL'));
  expect(query.order).toHaveBeenNthCalledWith(1, 'released_at', { ascending: false, nullsFirst: false });
  expect(query.order).toHaveBeenNthCalledWith(2, 'id', { ascending: false });
  expect(query.order).toHaveBeenCalledWith('id', { ascending: false }); expect(query.limit).toHaveBeenCalledWith(30);
  await fetchExploreCards(db, 'sbc');
  expect(query.or).toHaveBeenCalledWith('card_type.ilike.*SBC*,card_type.ilike.*POTM*,card_type.ilike.*TOKEN*,card_type.ilike.*SEASON*,card_type.ilike.*OBJ*');
  expect(query.limit).toHaveBeenNthCalledWith(2, 30);
});
it('all three preset codes hydrate through the existing share decoder and card loader', async () => {
  expect(squadPresets).toHaveLength(3);
  for (const preset of squadPresets) {
    const payload = decodeSquadSharePayload(preset.shareCode); expect(payload).not.toBeNull();
    const db = { from: () => ({ select: () => ({ in: async (_column, ids) => ({ data: ids.map(id => ({ id })), error: null }) }) }) };
    const players = await loadSharedSquadCards(db, payload, x => x);
    expect(Object.keys(players)).toHaveLength(11);
    expect(Object.values(players).filter(Boolean)).toHaveLength(payload.slots.filter(Boolean).length);
  }
});
it('renders tiles and uses a distinct drag payload while suppressing post-drag clicks', async () => {
  const mount = document.createElement('aside'), openDetail = vi.fn(), drag = vi.fn(), endDrag = vi.fn();
  createExplorePanel({ mount, load: async () => [card], openDetail, drag, endDrag, preset: vi.fn(), close: vi.fn(), name: () => 'Player', image: () => '/card.png', rating: () => 90 });
  await vi.waitFor(() => expect(mount.querySelector('.explore-tile')).not.toBeNull());
  const presets = [...mount.querySelectorAll('.explore-presets button')];
  expect(presets).toHaveLength(3);
  presets.forEach((button, index) => {
    expect(button.querySelector('.explore-preset-tag').textContent).toContain(squadPresets[index].tag);
    expect(button.querySelector('.explore-preset-label').textContent).not.toBe('');
    expect(button.title).toContain(button.querySelector('.explore-preset-label').textContent);
  });
  const autoPlace = vi.fn(); mount.addEventListener('click', autoPlace);
  const tile = mount.querySelector('.explore-tile'); tile.click(); expect(openDetail).toHaveBeenCalledExactlyOnceWith(card);
  expect(autoPlace).not.toHaveBeenCalled();
  expect(mount.querySelector('.explore-grid').classList.contains('is-distributed')).toBe(false);
  openDetail.mockClear(); const event = new Event('dragstart'); event.dataTransfer = { setData: vi.fn() }; tile.dispatchEvent(event);
  expect(event.dataTransfer.setData).toHaveBeenCalledWith(EXPLORE_DRAG_TYPE, JSON.stringify({ source: 'explore_panel', id: 20 }));
  expect(drag).toHaveBeenCalledWith(card); tile.click(); expect(openDetail).not.toHaveBeenCalled();
  tile.dispatchEvent(new Event('dragend')); expect(endDrag).toHaveBeenCalledOnce();
  tile.click(); expect(openDetail).not.toHaveBeenCalled();
});

it('reads only the DB primary meta score and safely hides absent or invalid values', () => {
  expect(getPrimaryMetaScore({ card_positions: [{ is_primary: false, meta_score: 99 }, { is_primary: true, meta_score: '98.42' }] })).toBe('98.4');
  for (const value of [null, undefined, NaN, Infinity, 'NaN', '', ' ', false, {}]) {
    expect(getPrimaryMetaScore({ raw: { card_positions: [{ is_primary: true, meta_score: value }] } })).toBeNull();
  }
  expect(getPrimaryMetaScore({})).toBeNull();
  expect(getPrimaryMetaScore({ card_positions: [{ is_primary: false, meta_score: 99 }] })).toBeNull();
  expect(getPrimaryMetaScore({ card_positions: [{ is_primary: true, meta_score: 0 }] })).toBe('0.0');
});
it('only recognizes explicit pitch controls, empty slots and card action buttons', () => {
  const pitch = document.createElement('div'); pitch.className = 'pitch';
  pitch.innerHTML = '<button class="slot"><span>+ Select</span></button><button class="slot occupied"><span class="slot-card-body">Player</span><span class="slot-card-actions"><button class="lock-player">Lock</button></span></button><button id="manager-slot">Manager</button><details id="formation-picker"><summary>Formation</summary><div id="formation-menu"><button>4-4-2</button></div></details>';
  // Build nested toolbar buttons with DOM APIs (HTML parser repairs nested button markup).
  const occupied = pitch.querySelector('.occupied');
  const actions = document.createElement('span'); actions.className = 'slot-card-actions'; occupied.append(actions);
  for (const label of ['Lock', 'Owned', 'Exclude', 'Swap', 'Delete']) {
    const button = document.createElement('button'); button.textContent = label; actions.append(button);
    expect(pitchPanelAction(button)).toBe('card-action');
  }
  expect(pitchPanelAction(pitch)).toBeNull();
  expect(pitchPanelAction(occupied.querySelector('.slot-card-body'))).toBeNull();
  expect(pitchPanelAction(pitch.querySelector('.slot span'))).toBe('select');
  expect(pitchPanelAction(pitch.querySelector('#manager-slot'))).toBe('control');
  expect(pitchPanelAction(pitch.querySelector('summary'))).toBe('control');
  expect(pitchPanelAction(pitch.querySelector('#formation-menu button'))).toBe('control');
});
it('renders background, portrait variants and primary meta without calculating stats', async () => {
  const mount = document.createElement('aside');
  createExplorePanel({ mount, load: async () => [{ ...card, card_type: 'SPECIAL_HEADSHOT', background_url: '/background.png', card_positions: [{ is_primary: true, meta_score: 98.44 }] }], openDetail: vi.fn(), drag: vi.fn(), endDrag: vi.fn(), preset: vi.fn(), close: vi.fn(), name: () => 'Player', image: () => '/portrait.png', rating: () => 90 });
  await vi.waitFor(() => expect(mount.querySelector('.explore-meta')?.textContent).toBe('⚡ 98.4'));
  expect(mount.querySelector('.explore-card-background').getAttribute('src')).toBe('/background.png');
  expect(mount.querySelector('.explore-portrait').classList.contains('is-headshot')).toBe(true);
});

it('keeps the explore visibility guard outside media queries and adjusts desktop widths at lg/xl', () => {
  const css = readFileSync('style.css', 'utf8');
  const guard = css.slice(css.indexOf('/* Preserve the selected panel'));
  expect(guard.slice(0, guard.indexOf('@media'))).toContain('.squad-workspace[data-panel=explore] .chemistry-panel { display: none; }');
  const desktop = css.slice(css.indexOf('/* Mutually exclusive desktop'));
  expect(desktop).toMatch(/@media \(min-width: 1024px\)[\s\S]*?flex: 0 0 350px/);
  expect(guard).toMatch(/@media \(min-width: 1280px\)[\s\S]*?flex-basis: 390px/);
  expect(desktop).toContain('@media (max-width: 1023px)');
});

it('themes every scroll surface and keeps details above the drawer', () => {
  const css = readFileSync('style.css', 'utf8');
  expect(css).toMatch(/:root, body, body \* \{ scrollbar-width: thin; scrollbar-color: rgba\(148, 163, 184, \.28\) transparent;/);
  for (const selector of ['::-webkit-scrollbar {', '::-webkit-scrollbar-track {', '::-webkit-scrollbar-thumb {', '::-webkit-scrollbar-thumb:hover {']) expect(css).toContain(selector);
  expect(css).toContain('.player-detail-modal { z-index: 1020; }');
  expect(css).not.toContain('.explore-grid.is-distributed');
});
