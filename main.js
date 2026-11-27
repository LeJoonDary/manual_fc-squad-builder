import { bindPitchTouchDrag } from './utils/pitchTouchDrag.js';
import { savedEvosStore, evoCardId } from './utils/savedEvos.js';
import { mountSavedEvos } from './components/SavedEvosLifecycle.jsx';
import { createSavedEvosList } from './components/SavedEvosList.js';
import { hasDesktopPointer, DESKTOP_POINTER_QUERY } from './utils/desktopPointer.js';
import { applySlotCustom, hasCustom, sanitizeCustom, canMovePitchEntry } from './utils/slotCustom.js';
import { readSquadState, writeSquadState, createSquadAutosave } from './utils/squadPersistence.js';
import { createSlotCustomPanel } from './components/SlotCustomPanel.js';
import { createSlotDetailedStats } from './components/SlotDetailedStats.js';
import { createModalAffiliationFilter } from './components/ModalAffiliationFilter.js';
import { createSlotPhysicalControls } from './components/SlotPhysicalControls.js';
import { countPhysicalRequirements } from './utils/physicalFilters.js';
import { createExplorePanel } from './components/ExplorePanel.js';
import { CardCostBadge } from './components/CardCostBadge';
import { getCardCost } from './utils/cardCost';
import { EXPLORE_DRAG_TYPE, initialSquadPanel, nextSquadPanel, canExplorePlay, findExploreSlot, pitchPanelAction, placeExplorePlayer, fetchExploreCards } from './utils/exploreSquad.js';
import { createEmptySlotTabState } from './utils/emptySlotTabState.js';
import { buildSquadShareUrl, decodeSquadSharePayload } from './utils/squadShareUtils';
import { loadSharedSquadCards } from './utils/squadShareHydration.js';
import { createSquadShareModal } from './components/SquadShareModal.js';
import { createRecommendationControls, replacementChemBadge, emptySlotRecommendationBadge } from './components/RecommendationControls.js';
import { getRecommendedPlayersForEmptySlot, getRecommendedPlayersForSlot, getEmptySlotPriceCap } from './utils/autoBuildUtils';
import { getLanguage, subscribeLanguage, ui } from './src/i18n/languageStore';
import { mountLanguageToggle } from './src/components/LanguageToggle.tsx';
import { setCardAction } from './src/i18n/cardActions';
import { createPlayerDbFilterLabel } from './src/i18n/playerDb';
import { translations } from './src/locales/translations';
import { formatMessage } from './src/i18n/languageStore';
import { startLanguageSync } from './src/i18n/languageStore';
import { mountDomTranslations } from './src/i18n/domTranslations';
import { normalizePlaystyles } from './utils/normalizePlaystyles.js';
import { createPlaystylesGridSelector } from './components/PlaystylesGridSelector.js';
import { formatSlotPosition } from './utils/pitchCardLabels.js';
import { createPlayerCard } from './components/PlayerCard.js';
import { handlePitchSlotClick } from './utils/pitchSlotInteraction.js';
import { createCardReviewButtons } from './components/CardReviewButton.js';
import { createPitchExcludeButton, syncPitchExclusions } from './components/PitchExcludeButton.js';
import { excludedCardVersionsStore } from './utils/excludedCardVersions.js';
import { createPitchChemistryBadge } from './components/PitchChemistryBadge.js';
import { createPitchMiniCard } from './components/PitchMiniCard.tsx';
import { createSquadSlots } from './components/SquadSlots.js';
import { preloadImages, preloadCardImages } from './utils/preloadImages.ts';
import { createAlternativePlayerModal } from './components/AlternativePlayerModal.js';
import { createMobileFiltersToggle } from './components/MobileFiltersToggle.js';
import { resetMobileZoom } from './utils/mobileZoom.js';
import { fetchModalPlayerPage, MODAL_PAGE_SIZE } from './utils/modalPlayers.js';
import { loadPlayerDetail } from './utils/playerCatalog.js';
import { createPlayerPagination, PLAYER_PAGE_SIZE } from './utils/playerPagination.js';
import { createPlayerDetailModal } from './components/PlayerDetailModal.js';
import { STAT_KEYS, defaultStats, activeStats, renderStatInputs } from './utils/statFilters.js';
import { fetchAffiliations, clubsForLeague, renderSearchableSelect } from './utils/affiliations.js';
import { fetchPlaystyleOptions } from './utils/playstyleFilters.js';
import { createPlaystyleIcons } from './components/PlaystyleIcons.js';
import { renderPlaystyleGrid } from './components/PlaystyleFilterGrid.js';
import { PLAYER_CARD_SELECT } from './utils/playerCards.js';
import { createDefaultFilters, fetchPlayersPage } from './utils/playerFilters.js';
import { getValueScoreGrade } from './utils/playerSearch.js';
import { createClient } from '@supabase/supabase-js';
import { adaptChemistryPlayerCard, calculateChemistry, isPositionMatched, normalizeChemistryPosition } from './utils/chemistry.ts';
import { createSquadEntry, isSquadSlotLocked, toggleSquadSlotLock } from './utils/squadLock.ts';
import { FORMATIONS, reassignFormation } from './utils/formations.js';
import { fitPitchViewport, fitSquadWorkspace } from './utils/pitchViewport.js';
import { calculateSquadTotalCost, getCardCoinPrice } from './utils/squadCost.ts';
import { calculateBudgetStatus, safeBudgetNumber, parseBudgetInput, formatBudgetNumber } from './utils/budget.ts';
import { mountAutoBuildSettings } from './components/AutoBuildSettings.jsx';
import { autoBuildManagerState } from './utils/autoBuildUi.js';
import { createLegalModal } from './components/LegalModal.js';
import { mountAnalytics } from './components/Analytics.jsx';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.log('SW registration failed: ', err);
    });
  });
}

startLanguageSync();
mountDomTranslations();
mountLanguageToggle(document.getElementById('language-control'));

mountAnalytics();
createLegalModal();

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const status = document.querySelector('#status');
const totalChemistryOutput = document.querySelector('#total-chemistry');
const totalCostOutput = document.querySelector('#total-cost');
const clearSquadButton = document.querySelector('#clear-squad');
const managerSlot = document.querySelector('#manager-slot');
const managerModal = document.querySelector('#manager-modal');
const managerForm = document.querySelector('#manager-form');
const managerLeagueSelect = document.querySelector('#manager-league');
const managerNationSelect = document.querySelector('#manager-nation');
const removeManagerButton = document.querySelector('#remove-manager');
const targetBudgetInput = document.querySelector('#target-budget');
const budgetProgress = document.querySelector('.budget-progress');
const budgetProgressFill = document.querySelector('#budget-progress-fill');
const budgetPercentage = document.querySelector('#budget-percentage');
const budgetRemaining = document.querySelector('#budget-remaining');
const budgetWarning = document.querySelector('#budget-warning');
const totalCostSummary = document.querySelector('.total-cost-summary');
const chemistryBreakdown = document.querySelector('#chemistry-breakdown');
const modal = document.querySelector('#player-modal');
const modalTitle = document.querySelector('#modal-title');
const modalDescription = document.querySelector('#modal-description');
const modalPlayerSearchInput = document.querySelector('#modal-player-search-input');
const modalPlayerSearchClear = document.querySelector('#modal-player-search-clear');

let modalPositionMode = 'all';
const modalPositionLabels = { all: 'All Positions', primary: 'Primary Position', secondary: 'Secondary Position' };
const playerList = document.querySelector('#player-list');
const tabButtons = document.querySelectorAll('[data-tab]');
const tabPages = document.querySelectorAll('.tab-page');
const appShell = document.querySelector('.app-shell');
const playerNameSearch = document.querySelector('#player-name-search');
const minOvrInput = document.querySelector('#min-ovr');
const maxOvrInput = document.querySelector('#max-ovr');
const minPriceInput = document.querySelector('#min-price');
const maxPriceInput = document.querySelector('#max-price');
const playerGrid = document.querySelector('#players-grid');
const playerResultCount = document.querySelector('#players-result-count');
const playerLoadMore = document.querySelector('#players-load-more');
const playerPaginationStatus = document.querySelector('#players-pagination-status');
let playerSearchAbort;
const playersPager = createPlayerPagination();
playerLoadMore.addEventListener('click', () => searchPlayers(capturePlayerPanelScrollPositions(), true));
const filterBarMount = document.querySelector('#filter-bar-mount');
const filterBar = document.querySelector('#players-filters');
const filtersContent = document.querySelector('#filters-content');
const clearAllFiltersButton = document.querySelector('#clear-all-filters');
const onlyPrimaryPositions = document.querySelector('#only-primary-positions');
const hasAllSelectedPositions = document.querySelector('#has-all-selected-positions');
const playstyleFilterGrid = document.querySelector('#playstyle-filter-grid');
const requireAllPlaystyles = document.querySelector('#require-all-playstyles');
const minPlaystylesInput = document.querySelector('#min-playstyles');
const maxPlaystylesInput = document.querySelector('#max-playstyles');
const minPlaystylesPlusInput = document.querySelector('#min-playstyles-plus');
const maxPlaystylesPlusInput = document.querySelector('#max-playstyles-plus');
const roleFilterList = document.querySelector('#role-filter-list');
const minHeightInput = document.querySelector('#min-height');
const maxHeightInput = document.querySelector('#max-height');
const minWeightInput = document.querySelector('#min-weight');
const maxWeightInput = document.querySelector('#max-weight');
const minAgeInput = document.querySelector('#min-age');
const maxAgeInput = document.querySelector('#max-age');
const nationFilter = document.querySelector('#nation-filter');
const leagueFilter = document.querySelector('#league-filter');
const clubFilter = document.querySelector('#club-filter');
renderStatInputs(document.querySelector('.stats-filter-grid'));
// Vanilla DOM 구조에서 <FilterBar /> 마운트와 동일한 역할을 합니다.
// 검색 헤더 바로 아래, 선수 그리드 바로 위에 기존 필터 DOM을 배치합니다.
if (filterBarMount && filterBar) filterBarMount.replaceWith(filterBar);
const mobileFiltersToggle = createMobileFiltersToggle({
  button: document.querySelector('#mobile-filters-toggle'),
  panel: filterBar,
  closePopovers: closeCommandPopovers,
});

const filters = createDefaultFilters();
const filterAccordionState = { ovr: true, positions: true, price: true, 'sm-wf': true, playstyles: true, roles: false, affiliation: true, rarity: true, stats: true, miscellaneous: true };
const ROLE_DATA = [
  { pos: 'ST', roles: ['Advanced Forward', 'False 9', 'Poacher', 'Target Forward'] },
  { pos: 'LW', roles: ['Inside Forward', 'Wide Playmaker', 'Winger'] },
  { pos: 'RW', roles: ['Inside Forward', 'Wide Playmaker', 'Winger'] },
  { pos: 'CAM', roles: ['Classic 10', 'Half Winger', 'Playmaker', 'Shadow Striker'] },
  { pos: 'LM', roles: ['Inside Forward', 'Wide Midfielder', 'Wide Playmaker', 'Winger'] },
  { pos: 'RM', roles: ['Inside Forward', 'Wide Midfielder', 'Wide Playmaker', 'Winger'] },
  { pos: 'CM', roles: ['Box to Box', 'Deep Lying Playmaker', 'Half Winger', 'Holding', 'Playmaker'] },
  { pos: 'CDM', roles: ['Box Crasher', 'Centre Half', 'Deep Lying Playmaker', 'Holding', 'Wide Half'] },
  { pos: 'LB', roles: ['Attacking Wingback', 'Falseback', 'Fullback', 'Inverted Wingback', 'Wingback'] },
  { pos: 'RB', roles: ['Attacking Wingback', 'Falseback', 'Fullback', 'Inverted Wingback', 'Wingback'] },
  { pos: 'CB', roles: ['Ball Playing Defender', 'Defender', 'Stopper', 'Wideback'] },
  { pos: 'GK', roles: ['Ball Playing Keeper', 'Goalkeeper', 'Sweeper Keeper'] },
];
let playerSearchRequest = 0;
let playerSearchTimer;
let pendingPanelScrollPositions = null;
let activeSlot = null;
let managerState = null;
let squadHydrated = false;
let resumePromise;
let savedMinChemistry = 33;
const squadAutosave = createSquadAutosave(() => {
  writeSquadState(localStorage, { formation: currentFormation, players: squad, manager: managerState,
    budget: targetBudget, maxBudget: targetBudget, minChemistry: savedMinChemistry,
    excludedCards: excludedCardVersionsStore.getState(),
    advancedSettings: { filters, tacticalSlotRoles, tacticalSlotPlaystyles, tacticalSlotStars, tacticalSlotPhysical, tacticalSlotStats },
  });
});
function persistCurrentSquad() {
  if (squadHydrated) squadAutosave.schedule();
}
function setSavedMinChemistry(value) { savedMinChemistry = value; persistCurrentSquad(); }
let targetBudget = 0;
let modalPlayerCards = [];
let dragOriginPosition = null;
let suppressSlotClick = false;
const squad = {};
function replacementOptions(position, controls = {}) {
  return { ...excludedCardVersionsStore.getState(), ...getRoleOptions(), currentSquad: squad,
    formation: currentFormation, slotPosition: position, totalBudget: targetBudget,
    mode: 'replace', considerManager: true, excludeZeroPriceCards: true, ...controls };
}
let replacementSnapshot;
const alternativeModal = createAlternativePlayerModal({
  getPriceContext: (position, controls) => ({ totalBudget: targetBudget,
    maxPrice: getEmptySlotPriceCap(replacementOptions(position, controls)) }),
  renderCard: (card, onActivate, suggestion) => {
    const article = buildPlayerCard(card, { actionLabel: recommendationText('선수 교체', 'Swap Player'), onActivate,
      synergyBadge: replacementChemBadge(suggestion.chemDelta) });
    article.querySelector('.recommendation-badge')?.classList.toggle('is-negative', suggestion.chemDelta < 0);
    return article;
  },
  async load(position, signal, currentCard, controls) {
    replacementSnapshot = getSquadSnapshot();
    const rows = await getRecommendedPlayersForSlot(supabase, replacementOptions(position, controls), undefined, signal);
    return rows.map(row => ({ ...row, card: { ...normalizeBrowserPlayerCard(row.card),
      meta_score: row.metaScore, score_position: position } }));
  },
  async select(position, card, signal, bestManager, controls) {
    const original = squad[position];
    if (replacementSnapshot !== getSquadSnapshot()) throw new Error(recommendationText('스쿼드가 변경되었습니다. 다시 열어주세요.', 'Squad changed. Reopen recommendations.'));
    const detail = normalizeBrowserPlayerCard(await loadPlayerDetail(supabase, card.id));
    signal.throwIfAborted();
    if (!detail || replacementSnapshot !== getSquadSnapshot()) throw new Error('The squad slot has changed');
    const valid = await getRecommendedPlayersForSlot(supabase, replacementOptions(position, controls), [detail.raw ?? detail], signal);
    signal.throwIfAborted();
    if (replacementSnapshot !== getSquadSnapshot() || squad[position] !== original || !valid.length) throw new Error(recommendationText('더 이상 선택할 수 없는 선수입니다.', 'This player is no longer eligible'));
    const slot = document.querySelector(`.slot[data-position="${position}"]`);
    if (!slot) return;
    placeCard(slot, detail, false);
    squad[position].isLocked = true;
    squad[position].isOwned = false;
    updateSlotLockUI(slot);
    managerState = autoBuildManagerState(valid[0].bestManager, affiliationCatalog, Object.values(squad).map(entry => entry?.card).filter(Boolean));
    renderManagerSlot(); updateSquadChemistry();
    window.dispatchEvent(new Event('auto-build-context-change'));
    status.textContent = recommendationText(`${position} 선수를 ${getCardName(detail)}(으)로 교체했습니다.`, `Replaced ${position} with ${getCardName(detail)}.`);
  },
});
function openSwapModal(position, currentCard) {
  if (!currentCard) return;
  alternativeModal.open(position, currentCard);
}
let affiliationCatalog = { nations: [], leagues: [], clubs: [] };
let modalRequest = 0;
let modalSelectionRequest = 0;
let modalSearchTimer;
let modalAbort;
const modalPager = createPlayerPagination(MODAL_PAGE_SIZE);
const modalLoadMore = document.querySelector('#modal-load-more');
modalLoadMore.addEventListener('click', () => loadModalPlayerPage());

function bindSquadSlot(slot) {
  slot.dataset.pitchSlot = 'true';
  slot.addEventListener('click', event => {
    const entry = squad[slot.dataset.position];
    handlePitchSlotClick(event, {
      entry, suppressed: suppressSlotClick, locked: isSquadSlotLocked(entry), open: openPlayerModal, details: openPitchDetail,
    });
  });
  slot.addEventListener('dragstart', handleSlotDragStart);
  slot.addEventListener('dragover', handleSlotDragOver);
  slot.addEventListener('dragenter', handleSlotDragEnter);
  slot.addEventListener('dragleave', handleSlotDragLeave);
  slot.addEventListener('drop', handleSlotDrop);
  slot.addEventListener('dragend', handleSlotDragEnd);
}
document.querySelectorAll('.slot').forEach(bindSquadSlot);
bindPitchTouchDrag(document.querySelector('.pitch'), {
  getEntry: slot => squad[slot.dataset.position],
  isLocked: isSquadSlotLocked,
  canMove: (origin, target) => canMovePitchEntry(squad, origin.dataset.position, target.dataset.position),
  move: (origin, target) => movePitchPlayer(origin.dataset.position, target),
});

const formationPicker = document.querySelector('#formation-picker');
const formationMenu = document.querySelector('#formation-menu');
let currentFormation = '4-3-1-2';
// Match the initial HTML slots to the same spacing used after formation changes.
const initialFormation = FORMATIONS.find(formation => formation.name === currentFormation);
document.querySelector('.pitch').style.setProperty('--formation-height', `${initialFormation.height}px`);
initialFormation.slots.forEach(({ position, x, y }) => {
  const slot = document.querySelector(`.slot[data-position="${position}"]`);
  slot.style.left = `${x}%`;
  slot.style.top = `${y}%`;
  if (slot.firstElementChild) slot.firstElementChild.textContent = formatSlotPosition(position);
  slot.setAttribute('aria-label', `Select ${formatSlotPosition(position)}`);
});
const pitchFrame = document.querySelector('.pitch-scroll');
const squadWorkspace = document.querySelector('.squad-workspace');
squadWorkspace.addEventListener('click', event => {
  if (squadWorkspace.getAttribute('aria-busy') === 'true') { event.preventDefault(); event.stopPropagation(); }
}, true);
const squadPage = document.querySelector('#squad-builder-page');
function updatePitchViewport() {
  if (window.matchMedia('(min-width: 768px)').matches && squadWorkspace.clientHeight) {
    const sidebarWidth = document.querySelector('.chemistry-panel').offsetWidth;
    const gap = Number.parseFloat(getComputedStyle(squadWorkspace).columnGap);
    // Measure the full page so the fitted wrapper can grow again after a resize.
    const layout = fitSquadWorkspace(squadPage.clientWidth, squadWorkspace.clientHeight,
      sidebarWidth, gap,
      document.querySelector('.pitch-heading').offsetHeight + 8);
    squadWorkspace.style.setProperty('--pitch-header-height', `${layout.headerHeight}px`);
  }
  const pitch = pitchFrame.querySelector('.pitch');
  const height = Number.parseFloat(pitch.style.getPropertyValue('--formation-height'));
  const availableWidth = pitchFrame.clientWidth;
  if (window.innerWidth < 1024 && availableWidth) pitchFrame.style.height = `${height * availableWidth / 900}px`;
  else pitchFrame.style.removeProperty('height');
  if (!availableWidth || !pitchFrame.clientHeight) return;
  const fit = fitPitchViewport(availableWidth, pitchFrame.clientHeight, height);
  pitch.style.setProperty('--pitch-width', `${fit.scale > 0 ? availableWidth / fit.scale : fit.width}px`);
  pitch.style.setProperty('--pitch-scale', fit.scale);
  pitch.style.setProperty('--pitch-height', `${pitchFrame.clientHeight / fit.scale}px`);
  squadWorkspace.style.setProperty('--fitted-pitch-width', `${Math.min(availableWidth, fit.width * fit.scale)}px`);
  squadWorkspace.style.setProperty('--fitted-pitch-height', `${Math.min(pitchFrame.clientHeight, fit.fittedHeight)}px`);
  pitchFrame.style.setProperty('--scroll-pitch-width', `${fit.width * fit.scale}px`);
  pitchFrame.style.setProperty('--scroll-pitch-height', `${fit.fittedHeight}px`);
}
const pitchResizeObserver = new ResizeObserver(updatePitchViewport);
pitchResizeObserver.observe(squadPage);
pitchResizeObserver.observe(squadWorkspace);
pitchResizeObserver.observe(pitchFrame);
pitchResizeObserver.observe(document.querySelector('.pitch-heading'));
updatePitchViewport();
let tacticalRolesDialog = null;
let selectedSlotPos = 'ST';
const tacticalSlotRoles = {};
const tacticalSlotPlaystyles = {};
const tacticalSlotStars = {};
const tacticalSlotPhysical = {};
const tacticalSlotStats = {};
let tacticalPlaystylesList = [];
let tacticalPlaystylesStatus = 'loading';
let tacticalTab = 'roles';
const updateAutoBuildFormation = mountAutoBuildSettings(
  document.querySelector('#auto-build-settings'), currentFormation, () => targetBudget,
  { budgetSection: document.querySelector('.budget-summary'), supabase, getSquadSnapshot, applyAutoBuildResult,
    getCurrentSquad: () => structuredClone(FORMATIONS.find(layout => layout.name === currentFormation).slots
      .map(slot => squad[slot.position] ?? null)),
    resetTargetBudget, openTacticalRoles, getRoleOptions, clearRolesAndPlaystyles,
    initializeAutoResume, setSavedMinChemistry, flushAutoResume: () => squadAutosave.flush(),
    resetAdvancedSettings: clearAllFilters },
);
function resetTargetBudget() {
  targetBudgetInput.value = '';
  updateTargetBudget({ target: targetBudgetInput });
}
function getSquadSnapshot() {
  return JSON.stringify({ formation: currentFormation, budget: targetBudget, squad, manager: managerState });
}

function applyAutoBuildResult(result, request) {
  if (request.snapshot !== getSquadSnapshot() || request.formation !== currentFormation || request.totalBudget !== targetBudget) {
    throw new Error('Formation, budget or squad changed during the build. Try again with your current settings.');
  }
  const slots = [...document.querySelectorAll('.pitch .slot')];
  // Validate and normalize every entry before changing the current squad.
  if ((!result.success || result.totalChemistry < (result.minChemistryTarget ?? 33)) || result.squad.length !== 11 || new Set(result.squad.map(p => p.slotPosition)).size !== 11) {
    throw new Error('Unable to verify the completed 11-player squad. Please try again.');
  }
  const placements = result.squad.map(player => {
    const slot = slots.find(item => item.dataset.position === player.slotPosition);
    const previous = squad[player.slotPosition];
    if (previous?.isLocked && String(previous.card_id) !== String(player.id)) {
      throw new Error('Locked players cannot be replaced. Please try again.');
    }
    const retained = Object.values(squad).find(entry => entry && String(entry.card_id) === String(player.id));
    const card = retained?.card ?? normalizeBrowserPlayerCard(player.card);
    if (!slot || !card || (!previous?.isLocked && !isCardInSlotPosition(card, player.slotPosition))) {
      throw new Error('Player position details are unavailable. Please try again.');
    }
    return { slot, card, state: retained ?? {}, isOwned: player.isOwned === true, isLocked: previous?.isLocked === true };
  });
  const nextManager = autoBuildManagerState(result.manager, affiliationCatalog, placements.map(item => item.card));
  preloadImages(placements);
  closeModal();
  managerModal.hidden = true;
  dragOriginPosition = null;
  clearSlotDragFeedback();
  Object.keys(squad).forEach(key => delete squad[key]);
  placements.forEach(({ slot, card, state, isOwned, isLocked }) => {
    placeCard(slot, card, false, { ...state, isOwned });
    squad[slot.dataset.position].isLocked = isLocked;
    updateSlotLockUI(slot);
  });
  managerState = nextManager;
  renderManagerSlot();
  updateSquadChemistry();
  status.textContent = 'Applied the auto-built squad of 11 players and manager settings.';
}
function applyFormation(formation, savedPlayers = null) {
  closeModal();
  const nextSquad = savedPlayers ?? reassignFormation(squad, formation.slots);
  preloadImages(Object.values(nextSquad));
  Object.keys(squad).forEach(key => delete squad[key]);
  const pitch = document.querySelector('.pitch');
  pitch.querySelectorAll('.slot').forEach(slot => slot.remove());
  pitch.style.setProperty('--formation-height', `${formation.height}px`);
  updatePitchViewport();
  formation.slots.forEach(({ position, x, y }) => {
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'slot';
    slot.dataset.position = position;
    slot.style.left = `${x}%`;
    slot.style.top = `${y}%`;
    slot.setAttribute('aria-label', `Select ${formatSlotPosition(position)}`);
    bindSquadSlot(slot);
    pitch.append(slot);
    const entry = nextSquad[position];
    if (entry) {
      placeCard(slot, entry.card, false, entry);
      squad[position].isLocked = entry.isLocked === true;
      updateSlotLockUI(slot);
    } else resetSlot(slot, false);
  });
  currentFormation = formation.name;
  updateAutoBuildFormation(currentFormation);
  document.querySelector('#formation-current').textContent = currentFormation;
  document.querySelector('.formation-label').textContent = currentFormation;
  document.querySelector('#squad-builder-page h1').textContent = `${currentFormation} Squad`;
  pitch.setAttribute('aria-label', `${currentFormation} Formation`);
  formationMenu.querySelectorAll('button').forEach(button =>
    button.setAttribute('aria-pressed', String(button.textContent === currentFormation)));
  formationPicker.open = false;
  dragOriginPosition = null;
  updateSquadChemistry();
  status.textContent = `${currentFormation} formation selected. Review player positions and chemistry.`;
  formationPicker.querySelector('summary').focus();
}
FORMATIONS.forEach(formation => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = formation.name;
  button.setAttribute('aria-pressed', String(formation.name === currentFormation));
  button.addEventListener('click', () => applyFormation(formation));
  formationMenu.append(button);
});
formationPicker.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    formationPicker.open = false;
    formationPicker.querySelector('summary').focus();
    event.stopPropagation();
  }
});
document.addEventListener('pointerdown', event => {
  if (!formationPicker.contains(event.target)) formationPicker.open = false;
});

clearSquadButton.addEventListener('click', clearAllPlayers);
managerSlot.addEventListener('click', openManagerModal);
document.querySelectorAll('[data-close-manager-modal]').forEach((button) => button.addEventListener('click', closeManagerModal));
managerForm.addEventListener('submit', saveManager);
removeManagerButton.addEventListener('click', removeManager);
targetBudgetInput.addEventListener('input', updateTargetBudget);
targetBudgetInput.addEventListener('focus', (event) => event.target.select());

tabButtons.forEach((button) => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});

playerNameSearch.addEventListener('input', (event) => {
  filters.name = event.target.value.trim();
  schedulePlayerSearch();
});

modalPlayerSearchInput.addEventListener('input', () => {
  updateModalPlayerSearch();
});

function setModalPositionMode() { modalPositionMode = 'all'; }

modalPlayerSearchClear.addEventListener('click', () => {
  modalPlayerSearchInput.value = '';
  updateModalPlayerSearch();
  modalPlayerSearchInput.focus();
});

[minOvrInput, maxOvrInput].forEach((input) => {
  input.addEventListener('input', (event) => {
    filters[input === minOvrInput ? 'minOvr' : 'maxOvr'] = event.target.value;
    schedulePlayerSearch();
  });
});

[minPriceInput, maxPriceInput].forEach((input) => {
  input.addEventListener('input', (event) => {
    filters[input === minPriceInput ? 'minPrice' : 'maxPrice'] = event.target.value;
    schedulePlayerSearch();
  });
});

document.querySelectorAll('[data-position-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    const position = button.dataset.positionFilter;
    if (filters.positions.has(position)) {
      filters.positions.delete(position);
      filters.selectedRoles = filters.selectedRoles.filter((role) => role.position !== position);
    } else {
      filters.positions.add(position);
    }
    button.classList.toggle('is-selected', filters.positions.has(position));
    button.setAttribute('aria-pressed', String(filters.positions.has(position)));
    renderRoleFilterRows();
    searchPlayers();
  });
});

document.querySelectorAll('[data-rating-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    const filterName = button.dataset.ratingFilter === 'sm' ? 'minSm' : 'minWf';
    const selectedValue = Number(button.dataset.ratingValue);
    filters[filterName] = filters[filterName] === selectedValue ? null : selectedValue;
    document.querySelectorAll(`[data-rating-filter="${button.dataset.ratingFilter}"]`).forEach((item) => {
      item.classList.toggle('is-selected', Number(item.dataset.ratingValue) === filters[filterName]);
    });
    searchPlayers();
  });
});

loadPlaystyleFilterOptions();
renderRoleFilterRows();
setupFilterCommandBar();
const shareAffiliationsReady = loadAffiliationFilterOptions();

[nationFilter, leagueFilter, clubFilter].forEach((select) => {
  select.addEventListener('change', () => {
    filters.nation = nationFilter.value;
    filters.league = leagueFilter.value;
    if (select === leagueFilter) renderClubOptions();
    filters.club = clubFilter.value;
    searchPlayers();
  });
});

document.querySelectorAll('[data-rarity-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    const rarity = button.dataset.rarityFilter;
    filters.rarities.has(rarity) ? filters.rarities.delete(rarity) : filters.rarities.add(rarity);
    const selected = filters.rarities.has(rarity);
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    searchPlayers();
  });
});

function resetStatInputs() {
  filters.stats = defaultStats();
  for (const key of STAT_KEYS) for (const bound of ['min', 'max']) document.querySelector('#' + bound + '-' + key).value = filters.stats[key][bound];
  document.querySelector('#stats-validation').textContent = '';
}
document.querySelector('#detailed-stats-form').addEventListener('submit', event => {
  event.preventDefault();
  const values = defaultStats();
  for (const key of STAT_KEYS) {
    for (const bound of ['min', 'max']) {
      const input = document.querySelector('#' + bound + '-' + key);
      values[key][bound] = input.value === '' ? '' : Number(input.value);
    }
    if (values[key].min !== '' && values[key].max !== '' && values[key].min > values[key].max) {
      document.querySelector('#stats-validation').textContent = key + ': Min cannot exceed Max.';
      return;
    }
  }
  filters.stats = values;
  document.querySelector('#stats-validation').textContent = '';
  searchPlayers();
  const statsPanel = document.querySelector('[data-filter-section="stats"]');
  statsPanel.classList.remove('is-command-open');
  const statsTrigger = statsPanel.querySelector('[data-filter-accordion]');
  statsTrigger.setAttribute('aria-expanded', 'false');
  statsTrigger.focus();
});
document.querySelector('#clear-stats').addEventListener('click', () => { resetStatInputs(); searchPlayers(); });



document.querySelectorAll('[data-misc-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    const { miscFilter: filterName, miscValue: value } = button.dataset;
    if (filterName === 'accele' || filterName === 'body') {
      const filterSet = filterName === 'accele' ? filters.acceleTypes : filters.bodyTypes;
      filterSet.has(value) ? filterSet.delete(value) : filterSet.add(value);
      button.classList.toggle('is-selected', filterSet.has(value));
    } else {
      const stateKey = filterName === 'foot' ? 'preferredFoot' : 'gender';
      filters[stateKey] = filters[stateKey] === value ? '' : value;
      document.querySelectorAll(`[data-misc-filter="${filterName}"]`).forEach((item) => {
        item.classList.toggle('is-selected', item.dataset.miscValue === filters[stateKey]);
      });
    }
    searchPlayers();
  });
});

[
  [minHeightInput, 'minHeight'], [maxHeightInput, 'maxHeight'],
  [minWeightInput, 'minWeight'], [maxWeightInput, 'maxWeight'],
  [minAgeInput, 'minAge'], [maxAgeInput, 'maxAge'],
].forEach(([input, filterName]) => {
  input.addEventListener('input', (event) => {
    filters[filterName] = event.target.value;
    schedulePlayerSearch();
  });
});

setupDualRangeControls();

requireAllPlaystyles.addEventListener('change', () => {
  filters.requireAllPlaystyles = requireAllPlaystyles.checked;
  searchPlayers();
});

[
  [minPlaystylesInput, 'minPlaystyles'], [maxPlaystylesInput, 'maxPlaystyles'],
  [minPlaystylesPlusInput, 'minPlaystylesPlus'], [maxPlaystylesPlusInput, 'maxPlaystylesPlus'],
].forEach(([input, filterName]) => {
  input.addEventListener('input', (event) => {
    filters[filterName] = event.target.value;
    schedulePlayerSearch();
  });
});

[onlyPrimaryPositions, hasAllSelectedPositions].forEach((toggle) => {
  toggle.addEventListener('change', () => {
    filters.onlyPrimary = onlyPrimaryPositions.checked;
    filters.hasAllPositions = hasAllSelectedPositions.checked;
    searchPlayers();
  });
});

document.querySelectorAll('[data-filter-accordion]').forEach((button) => {
  button.addEventListener('click', () => toggleCommandPopover(button.dataset.filterAccordion));
});

clearAllFiltersButton.addEventListener('click', clearAllFilters);
document.querySelector('#mobile-clear-all-filters').addEventListener('click', clearAllFilters);

document.querySelectorAll('[data-close-modal]').forEach((button) => {
  button.addEventListener('click', closeModal);
});

const playerDetail = createPlayerDetailModal({
  supabase, normalizeBrowserPlayerCard, asArray, getCardImage, getCardRating,
  getCardName, getPlayStyles, createPlaystyleBadges, getRoles, unwrapRelation,
});
const createReviewButton = createCardReviewButtons(supabase, playerDetail.openReview);

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (playerDetail.isOpen) playerDetail.close();
  else if (!modal.hidden) closeModal();
  else closeCommandPopovers();
});

document.addEventListener('pointerdown', (event) => {
  const isInsidePopover = event.composedPath().some((node) => node instanceof Element && node.classList.contains('command-filter'));
  if (!isInsidePopover) closeCommandPopovers();
});

function setActiveTab(tabName) {
  appShell.classList.toggle('is-players-active', tabName === 'players');
  appShell.classList.toggle('is-squad-active', tabName === 'squad-builder');
  document.body.classList.toggle('is-squad-active', tabName === 'squad-builder');
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  tabPages.forEach((page) => {
    page.hidden = page.id !== `${tabName}-page`;
  });

  if (tabName !== 'squad-builder' && !modal.hidden) closeModal();
  if (tabName === 'players') searchPlayers();
}

// Completed raw pages only: reapply current squad exclusions when rendering.
const searchResultCache = new Map();
function searchResultKey(kind, context, offset = 0) {
  return JSON.stringify([kind, context, offset], (_, value) => value instanceof Set ? [...value].sort() : value);
}
function playersResultKey(offset = 0) {
  return searchResultKey('players', { ...filters, name: filters.name.trim() }, offset);
}
function modalResultKey(offset = 0) {
  return searchResultKey('modal', [normalizePosition(activeSlot?.dataset.position ?? ''), modalPositionMode, modalPlayerSearchInput.value.trim(), modalAffiliation.getValue(), modalPriceCap(), includeAcquisitionCards], offset);
}
function cacheSearchResult(key, result) {
  searchResultCache.delete(key);
  searchResultCache.set(key, result);
  if (searchResultCache.size > 100) searchResultCache.delete(searchResultCache.keys().next().value);
}

function isSearchTermReady(value) {
  // Empty input restores the unfiltered list; a single character never queries.
  return Array.from(value.trim()).length !== 1;
}

function schedulePlayerSearch() {
  persistCurrentSquad();
  window.clearTimeout(playerSearchTimer);
  ++playerSearchRequest;
  playerSearchAbort?.abort();
  playersPager.reset();
  playerLoadMore.disabled = true;
  playerLoadMore.hidden = true;
  playerPaginationStatus.textContent = '';
  if (!isSearchTermReady(filters.name)) {
    playerGrid.setAttribute('aria-busy', 'false');
    playerResultCount.textContent = 'Enter at least 2 characters to search.';
    renderPlayerGridMessage('Enter at least 2 characters to search.');
    return;
  }
  if (searchResultCache.has(playersResultKey())) {
    searchPlayers();
    return;
  }
  playerGrid.replaceChildren();
  resetPlayerResultsScroll();
  playerGrid.setAttribute('aria-busy', 'true');
  setPlayerGridLoading();
  playerSearchTimer = window.setTimeout(searchPlayers, 180);
}

function setupDualRangeControls() {
  document.querySelectorAll('[data-range-control]').forEach((control) => {
    const lowerBound = Number(control.dataset.min);
    const upperBound = Number(control.dataset.max);
    const minRange = control.querySelector('[data-range-min]');
    const maxRange = control.querySelector('[data-range-max]');
    const minInput = document.getElementById(control.dataset.minInput);
    const maxInput = document.getElementById(control.dataset.maxInput);

    const updatePresentation = () => {
      const minValue = Number(minRange.value);
      const maxValue = Number(maxRange.value);
      const span = upperBound - lowerBound || 1;
      const minPercent = ((minValue - lowerBound) / span) * 100;
      const maxPercent = ((maxValue - lowerBound) / span) * 100;
      control.style.setProperty('--range-start', `${minPercent}%`);
      control.style.setProperty('--range-end', `${maxPercent}%`);
      const output = control.querySelector('[data-range-output]');
      const unit = control.dataset.unit ?? '';
      const hasMinimum = minInput.value !== '';
      const hasMaximum = maxInput.value !== '';
      output.textContent = hasMinimum || hasMaximum
        ? `${hasMinimum ? minInput.value : 'Any'}${hasMinimum ? unit : ''} — ${hasMaximum ? maxInput.value : 'Any'}${hasMaximum ? unit : ''}`
        : `Any ${control.dataset.minInput.includes('ovr') ? 'OVR' : control.dataset.minInput.replace('min-', '')}`;
    };

    const dispatchNumberInput = (input, value) => {
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    minRange.addEventListener('input', () => {
      if (Number(minRange.value) > Number(maxRange.value)) minRange.value = maxRange.value;
      dispatchNumberInput(minInput, minRange.value);
      updatePresentation();
    });

    maxRange.addEventListener('input', () => {
      if (Number(maxRange.value) < Number(minRange.value)) maxRange.value = minRange.value;
      dispatchNumberInput(maxInput, maxRange.value);
      updatePresentation();
    });

    [minInput, maxInput].forEach((input) => {
      input.addEventListener('input', () => {
        const parsed = Number(input.value);
        if (input.value !== '' && Number.isFinite(parsed)) {
          const clamped = Math.min(upperBound, Math.max(lowerBound, parsed));
          if (input === minInput) minRange.value = String(Math.min(clamped, Number(maxRange.value)));
          else maxRange.value = String(Math.max(clamped, Number(minRange.value)));
        } else if (input === minInput) minRange.value = String(lowerBound);
        else maxRange.value = String(upperBound);
        updatePresentation();
      });
    });

    updatePresentation();
  });
}

function resetDualRangeControls() {
  document.querySelectorAll('[data-range-control]').forEach((control) => {
    control.querySelector('[data-range-min]').value = control.dataset.min;
    control.querySelector('[data-range-max]').value = control.dataset.max;
    const minInput = document.getElementById(control.dataset.minInput);
    const maxInput = document.getElementById(control.dataset.maxInput);
    minInput.dispatchEvent(new Event('input', { bubbles: true }));
    maxInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function setupFilterCommandBar() {
  document.querySelectorAll('[data-filter-panel]').forEach((panel) => { panel.hidden = false; });

  const ovrPanel = document.querySelector('[data-filter-section="ovr"]');
  const pricePanel = document.querySelector('[data-filter-section="price"]');
  const metricGrid = document.createElement('div');
  metricGrid.className = 'metric-popover-grid';
  metricGrid.append(...ovrPanel.querySelector('.filter-accordion-content').children);
  metricGrid.append(...pricePanel.querySelector('.filter-accordion-content').children);
  ovrPanel.querySelector('.filter-accordion-content').append(metricGrid);
  pricePanel.remove();

  const positionsPanel = document.querySelector('[data-filter-section="positions"]');
  const rolesPanel = document.querySelector('[data-filter-section="roles"]');
  const roleSubfilter = document.createElement('section');
  roleSubfilter.className = 'position-role-subfilter';
  roleSubfilter.hidden = true;
  const roleHeading = document.createElement('div');
  roleHeading.className = 'position-role-heading';
  const roleTitle = document.createElement('strong');
  roleTitle.textContent = 'Roles';
  const roleOptional = document.createElement('span');
  roleOptional.textContent = 'Optional';
  roleHeading.append(roleTitle, roleOptional);
  roleSubfilter.append(roleHeading, ...rolesPanel.querySelector('.filter-accordion-content').children);
  positionsPanel.querySelector('.filter-accordion-content').append(roleSubfilter);
  rolesPanel.remove();
  renderRoleFilterRows();

  const commands = {
    positions: { icon: '⚽', key: 'positionRoles' },
    ovr: { icon: '📊', key: 'ovrPrice' },
    'sm-wf': { icon: '★', key: 'smWf' },
    playstyles: { icon: '✨', key: 'playstyles' },
    affiliation: { icon: '🌐', key: 'affiliation' },
    rarity: { icon: '🃏', key: 'cardRarity' },
    stats: { icon: '📈', key: 'detailedStats' },
    miscellaneous: { icon: '⚙️', key: 'physicalBody' },
  };

  Object.entries(commands).forEach(([section, command]) => {
    const panel = document.querySelector(`[data-filter-section="${section}"]`);
    const trigger = panel.querySelector('.filter-accordion-trigger');
    const content = panel.querySelector('.filter-accordion-content');
    panel.classList.remove('is-closed');
    panel.classList.add('command-filter');
    trigger.replaceChildren();
    const icon = document.createElement('span');
    icon.className = 'command-icon';
    icon.textContent = command.icon;
    const label = createPlayerDbFilterLabel(command.key);
    label.id = `filter-label-${section}`;
    const summary = document.createElement('span');
    summary.className = 'command-summary';
    summary.dataset.commandSummary = section;
    summary.hidden = true;
    const chevron = document.createElement('span');
    chevron.className = 'command-chevron';
    chevron.textContent = '⌄';
    trigger.append(icon, label, summary, chevron);
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    content.setAttribute('role', 'dialog');
    content.setAttribute('aria-labelledby', label.id);
    // React PopoverContent의 onPointerDown/onClick stopPropagation과 동일한 보호 계층입니다.
    // 슬라이더, input, button의 기본 동작은 취소하지 않고 문서 바깥 클릭 감지로의 전파만 막습니다.
    content.addEventListener('pointerdown', (event) => event.stopPropagation());
    content.addEventListener('click', (event) => event.stopPropagation());
  });

  document.querySelectorAll('[data-rating-filter]').forEach((button) => {
    const rating = Number(button.dataset.ratingValue);
    const type = button.dataset.ratingFilter === 'sm' ? 'Skill Moves' : 'Weak Foot';
    button.textContent = '★'.repeat(rating);
    button.setAttribute('aria-label', `${type} ${rating} stars or higher`);
  });

  filtersContent.setAttribute('aria-label', 'Player filter bar');
  new ResizeObserver(fitOpenFilterPopovers).observe(filtersContent.closest('.players-filters'));
  updateCommandSummaries();
}

function toggleCommandPopover(section) {
  const accordion = document.querySelector(`[data-filter-section="${section}"]`);
  const shouldOpen = !accordion.classList.contains('is-command-open');
  closeCommandPopovers();
  accordion.classList.toggle('is-command-open', shouldOpen);
  accordion.querySelector('[data-filter-accordion]').setAttribute('aria-expanded', String(shouldOpen));
  if (shouldOpen) { fitOpenFilterPopovers(); requestAnimationFrame(fitOpenFilterPopovers); }
}

function fitOpenFilterPopovers() {
  document.querySelectorAll('.command-filter.is-command-open > .filter-accordion-content').forEach(content => {
    const top = content.getBoundingClientRect().top;
    content.style.maxHeight = `${Math.max(0, Math.min(window.innerHeight * .75, window.innerHeight - top - 12))}px`;
  });
}
window.addEventListener('resize', fitOpenFilterPopovers);

function closeCommandPopovers() {
  document.querySelectorAll('.command-filter.is-command-open').forEach((panel) => {
    panel.classList.remove('is-command-open');
    panel.querySelector('[data-filter-accordion]').setAttribute('aria-expanded', 'false');
  });
}

function updateCommandSummaries() {
  const summaries = {
    positions: filters.positions.size
      ? `${filters.positions.size}${filters.selectedRoles.length ? ` · Roles ${filters.selectedRoles.length}` : ''}` : '',
    ovr: filters.minOvr !== '' || filters.maxOvr !== ''
      ? `${filters.minOvr || 'Any'}–${filters.maxOvr || 'Any'}`
      : (filters.minPrice !== '' || filters.maxPrice !== '' ? 'Price Set' : ''),
    'sm-wf': filters.minSm || filters.minWf
      ? `SM ${filters.minSm || '–'} · WF ${filters.minWf || '–'}` : '',
    playstyles: (filters.selectedNormalIds.length + filters.selectedPlusIds.length) || '',
    affiliation: [filters.nation, filters.league, filters.club].filter(Boolean).length || '',
    rarity: filters.rarities.size || '',
    stats: activeStats(filters.stats).length || '',
    miscellaneous: [
      filters.acceleTypes.size, filters.bodyTypes.size, filters.preferredFoot, filters.gender,
      filters.minHeight, filters.maxHeight, filters.minWeight, filters.maxWeight,
      filters.minAge, filters.maxAge,
    ].filter(Boolean).length || '',
  };
  Object.entries(summaries).forEach(([section, value]) => {
    const badge = document.querySelector(`[data-command-summary="${section}"]`);
    if (!badge) return;
    badge.textContent = value;
    badge.hidden = !value;
    badge.closest('.command-filter').classList.toggle('has-active-filter', Boolean(value));
  });
  // Count active filter groups, matching the eight command buttons.
  mobileFiltersToggle.updateCount(Object.values({
    ...summaries, positions: summaries.positions || filters.selectedRoles.length,
  }).filter(Boolean).length);
}

function resetPlayerResultsScroll() {
  for (const selector of ['.players-results', '.players-layout']) {
    const panel = document.querySelector(selector);
    if (panel) panel.scrollTop = 0;
  }
}

async function searchPlayers(scrollPositions = capturePlayerPanelScrollPositions(), append = false) {
  persistCurrentSquad();
  if (!isSearchTermReady(filters.name)) return;
  if (append && (playersPager.state.loading || !playersPager.state.hasMore)) return;
  window.clearTimeout(playerSearchTimer);
  playerSearchAbort?.abort();
  if (!append) {
    playersPager.reset();
    scrollPositions = { ...scrollPositions, results: 0 };
    resetPlayerResultsScroll();
  }
  const ticket = playersPager.begin();
  if (!ticket) return;
  const requestId = ++playerSearchRequest;
  playerSearchAbort = new AbortController();
  const signal = playerSearchAbort.signal;
  const cacheKey = playersResultKey(ticket.offset);
  const cached = searchResultCache.get(cacheKey);
  updateCommandSummaries();
  if (!cached) {
    playerLoadMore.hidden = false;
    playerLoadMore.disabled = true;
    playerLoadMore.textContent = 'Loading players...';
    playerGrid.setAttribute('aria-busy', 'true');
    if (!append || !playersPager.state.cards.length) {
      playerGrid.replaceChildren();
      playerPaginationStatus.textContent = '';
      setPlayerGridLoading();
    }
  }
  try {
    const result = cached ?? await fetchPlayersPage(supabase, filters, { offset: ticket.offset, signal });
    cacheSearchResult(cacheKey, result);
    const { rows, total } = result;
    if (requestId !== playerSearchRequest) return;
    const cards = rows.map(normalizeBrowserPlayerCard).filter(Boolean);
    const portraitsReady = preloadCardImages(cards);
    if (portraitsReady) {
      playerGrid.setAttribute('aria-busy', 'true');
      playerLoadMore.disabled = true;
      playerLoadMore.textContent = 'Loading players...';
      if (!append) {
        playerGrid.replaceChildren();
        setPlayerGridLoading();
      }
      await portraitsReady;
    }
    if (requestId !== playerSearchRequest || signal.aborted) return;
    const previousCount = playersPager.state.cards.length;
    if (!playersPager.complete(ticket, rows, cards, total)) return;
    if (append && previousCount) {
      for (const card of playersPager.state.cards.slice(previousCount)) {
        playerGrid.append(buildPlayerCard(card, { onActivate: playerDetail.open }));
      }
    } else renderPlayerGrid(playersPager.state.cards, scrollPositions);
    const loaded = playersPager.state.cards.length.toLocaleString('en-US');
    const matching = total.toLocaleString('en-US');
    playerResultCount.textContent = formatMessage(translations.en.playerDb.resultCount, { current: loaded, total: matching });
    playerPaginationStatus.textContent = `Showing ${loaded} of ${matching} matching cards, ranked by OVR.`;
    playerLoadMore.hidden = !playersPager.state.hasMore;
    playerLoadMore.textContent = `Load More (${Math.min(PLAYER_PAGE_SIZE, Math.max(0, total - playersPager.state.offset))} Players)`;
  } catch (error) {
    if (requestId !== playerSearchRequest || signal.aborted) return;
    console.error('Player filter error:', error?.message ?? error);
    playersPager.fail(ticket);
    if (!playersPager.state.cards.length) renderPlayerGridMessage('Unable to load players. Please try again.', true, scrollPositions);
    playerPaginationStatus.textContent = 'Search failed. Please try again.';
    playerLoadMore.hidden = false;
    playerLoadMore.textContent = 'Try Again';
  } finally {
    if (requestId === playerSearchRequest) {
      playerLoadMore.disabled = false;
      playerGrid.classList.remove('is-loading');
      playerGrid.setAttribute('aria-busy', 'false');
    }
  }
}

async function loadPlaystyleFilterOptions() {
  playstyleFilterGrid.textContent = 'Loading PlayStyles…';
  tacticalPlaystylesStatus = 'loading';
  if (tacticalRolesDialog) renderRoleFilterRows();
  try {
    tacticalPlaystylesList = await fetchPlaystyleOptions(supabase);
    tacticalPlaystylesStatus = 'ready';
    renderPlaystyleFilterButtons(tacticalPlaystylesList);
    if (tacticalRolesDialog) renderRoleFilterRows();
  } catch (error) {
    tacticalPlaystylesStatus = 'error';
    if (tacticalRolesDialog) renderRoleFilterRows();
    console.error('Playstyle master lookup failed:', error);
    playstyleFilterGrid.textContent = 'Unable to load PlayStyles. ';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Try Again';
    retry.addEventListener('click', loadPlaystyleFilterOptions);
    playstyleFilterGrid.append(retry);
  }
}

function renderPlaystyleFilterButtons(options) {
  renderPlaystyleGrid(playstyleFilterGrid, options, filters, () => searchPlayers());
}

function replaceSelectOptions(select, placeholder, values, selectedValue = '') {
  const options = [new Option(placeholder, ''), ...values.map((value) => new Option(value, value))];
  select.replaceChildren(...options);
  select.value = values.includes(selectedValue) ? selectedValue : '';
}

function replaceMasterOptions(select, placeholder, rows, selectedValue) {
  select.replaceChildren(new Option(placeholder, ''), ...rows.map(row => {
    const duplicate = rows.some(other => other.id !== row.id && other.name === row.name);
    return new Option(duplicate ? `${row.name} (${row.short_name || row.id})` : row.name, String(row.id));
  }));
  select.value = rows.some(row => String(row.id) === selectedValue) ? selectedValue : '';
  renderSearchableSelect(select, rows);
}

function renderClubOptions() {
  replaceMasterOptions(clubFilter, 'All Clubs', clubsForLeague(affiliationCatalog.clubs, leagueFilter.value), filters.club);
  if (affiliationCatalog.clubs.length) filters.club = clubFilter.value;
}

async function loadAffiliationFilterOptions() {
  try {
    affiliationCatalog = await fetchAffiliations(supabase);
    modalAffiliation.setCatalog(affiliationCatalog);
    renderAffiliationOptions();
  } catch (error) {
    console.error('Affiliation master lookup failed:', error);
    const message = document.createElement('button');
    message.type = 'button';
    message.textContent = 'Unable to load affiliations · Try Again';
    message.addEventListener('click', () => { message.remove(); loadAffiliationFilterOptions(); });
    nationFilter.parentElement.append(message);
  }
}

function renderAffiliationOptions() {
  replaceMasterOptions(nationFilter, 'All Nations', affiliationCatalog.nations, filters.nation);
  replaceMasterOptions(leagueFilter, 'All Leagues', affiliationCatalog.leagues, filters.league);
  renderSearchableSelect(nationFilter, affiliationCatalog.nations);
  replaceMasterOptions(managerNationSelect, 'Select a nation', affiliationCatalog.nations, managerState?.nationId ?? '');
  replaceMasterOptions(managerLeagueSelect, 'Select a league', affiliationCatalog.leagues, managerState?.leagueId ?? '');
  renderSearchableSelect(managerNationSelect, affiliationCatalog.nations);
  renderSearchableSelect(managerLeagueSelect, affiliationCatalog.leagues);
  renderClubOptions();
}

function clearRolesAndPlaystyles() {
  filters.selectedRoles = [];
  for (const key of Object.keys(tacticalSlotRoles)) delete tacticalSlotRoles[key];
  for (const key of Object.keys(tacticalSlotPlaystyles)) delete tacticalSlotPlaystyles[key];
  for (const key of Object.keys(tacticalSlotStars)) delete tacticalSlotStars[key];
  for (const key of Object.keys(tacticalSlotPhysical)) delete tacticalSlotPhysical[key];
  for (const key of Object.keys(tacticalSlotStats)) delete tacticalSlotStats[key];
  renderRoleFilterRows();
  window.dispatchEvent(new Event('auto-build-context-change'));
}
function getRoleOptions() {
  const slots = FORMATIONS.find(item => item.name === currentFormation).slots;
  const slotRequirements = {};
  for (const slot of slots) {
    const roles = Object.hasOwn(tacticalSlotRoles, slot.position) ? tacticalSlotRoles[slot.position] ?? []
      : filters.selectedRoles.filter(role => role.position === normalizeChemistryPosition(slot.position))
        .map(role => ({ name: role.name, minLevel: role.level }));
    const playstyles = tacticalSlotPlaystyles[slot.position];
    const stars = tacticalSlotStars[slot.position] ?? {};
    const physical = tacticalSlotPhysical[slot.position];
    const detailedStats = tacticalSlotStats[slot.position];
    if (roles.length || playstyles?.length || stars.minSm || stars.minWf || countPhysicalRequirements(physical) || activeStats(detailedStats).length) slotRequirements[slot.position] = {
      ...stars,
      ...(activeStats(detailedStats).length ? { detailedStats: structuredClone(detailedStats) } : {}),
      ...(countPhysicalRequirements(physical) ? { physical: structuredClone(physical) } : {}),
      ...(roles.length ? { roles } : {}),
      ...(playstyles?.length ? { playstyles } : {}),
    };
  }
  return { slotRequirements };

}
function renderTacticalPitch() {
  if (!tacticalRolesDialog) return;
  const pitch = tacticalRolesDialog.querySelector('.tactical-mini-pitch');
  pitch.replaceChildren();
  const formation = FORMATIONS.find(item => item.name === currentFormation);
  if (!formation.slots.some(slot => slot.position === selectedSlotPos)) selectedSlotPos = formation.slots.find(slot => normalizeChemistryPosition(slot.position) === 'ST')?.position ?? formation.slots[0].position;
  tacticalRolesDialog.querySelector('.tactical-formation-name').textContent = currentFormation;
  const requirements = getRoleOptions().slotRequirements;
  for (const slot of formation.slots) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'tactical-slot';
    node.dataset.slot = slot.position;
    node.style.left = slot.x + '%'; node.style.top = slot.y + '%';
    node.textContent = slot.position;
    node.setAttribute('aria-pressed', String(selectedSlotPos === slot.position));
    node.setAttribute('aria-label', slot.position + (requirements[slot.position] ? ' advanced settings configured' : ' select advanced settings'));
    if (requirements[slot.position]) { const dot = document.createElement('span'); dot.className = 'tactical-role-dot'; node.append(dot); }
    node.addEventListener('click', () => { selectedSlotPos = slot.position; renderRoleFilterRows(); });
    pitch.append(node);
  }
}
function openTacticalRoles() {
  if (tacticalRolesDialog) return;
  const content = document.querySelector('.position-role-subfilter');
  const originalParent = content.parentNode;
  const originalNext = content.nextSibling;
  const trigger = document.activeElement;
  const dialog = document.createElement('dialog');
  tacticalRolesDialog = dialog;
  dialog.className = 'tactical-roles-dialog';
  dialog.setAttribute('aria-labelledby', 'tactical-roles-title');
  dialog.innerHTML = '<header><h2 id="tactical-roles-title" data-i18n="modals.advancedTitle">Advanced Builder Settings</h2><button type="button" aria-label="Close Advanced Settings">×</button></header>';
  const description = document.createElement('p');
  description.dataset.i18n = 'modals.advancedDesc';
  description.textContent = 'Configure Roles, Playstyles, Detailed Stats, and Physical & Body requirements for each slot.';
  dialog.append(description);
  const map = document.createElement('div');
  map.innerHTML = '<p class="tactical-formation-name"></p><div class="tactical-mini-pitch" aria-label="Formation slots"></div>';
  const tabs = document.createElement('div');
  tabs.className = 'tactical-tabs';
  for (const [tab, label] of [['roles', '🎭 Roles'], ['playstyles', '⚡ Playstyles'], ['stats', '📈 Detailed Stats'], ['physical', '⚙️ Physical & Body']]) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.tab = tab; button.textContent = ui(label);
    button.addEventListener('click', () => { tacticalTab = tab; renderRoleFilterRows(); });
    tabs.append(button);
  }
  const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'tactical-clear-all'; reset.textContent = 'Clear All';
  reset.addEventListener('click', () => {
    filters.selectedRoles = [];
    for (const key of Object.keys(tacticalSlotRoles)) delete tacticalSlotRoles[key];
    for (const key of Object.keys(tacticalSlotPlaystyles)) delete tacticalSlotPlaystyles[key];
    for (const key of Object.keys(tacticalSlotStars)) delete tacticalSlotStars[key];
    for (const key of Object.keys(tacticalSlotPhysical)) delete tacticalSlotPhysical[key];
    for (const key of Object.keys(tacticalSlotStats)) delete tacticalSlotStats[key];
    renderRoleFilterRows();
  });
  tacticalTab = 'roles';
  dialog.append(map, tabs, content, reset);
  document.body.append(dialog);
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    originalParent.insertBefore(content, originalNext);
    tacticalRolesDialog = null;
    dialog.remove();
    renderRoleFilterRows();
    trigger?.focus();
  }, { once: true });
  renderRoleFilterRows();
  dialog.showModal();
}
function renderTacticalTabs() {
  if (!tacticalRolesDialog) return;
  const req = getRoleOptions().slotRequirements[selectedSlotPos] ?? {};
  const stars = Number(Boolean(req.minSm)) + Number(Boolean(req.minWf));
  const counts = { roles: (req.roles?.length ?? 0) + stars, playstyles: (req.playstyles?.length ?? 0) + stars,
    stats: activeStats(req.detailedStats).length, physical: countPhysicalRequirements(req.physical) };
  const labels = { roles: '🎭 Roles', playstyles: '⚡ Playstyles', stats: '📈 Detailed Stats', physical: '⚙️ Physical & Body' };
  tacticalRolesDialog.querySelectorAll('[data-tab]').forEach(button => {
    const tab = button.dataset.tab;
    button.setAttribute('aria-pressed', String(tab === tacticalTab));
    button.replaceChildren(document.createTextNode(ui(labels[tab])));
    if (counts[tab]) {
      const badge = document.createElement('span'); badge.className = 'tactical-count'; badge.textContent = String(counts[tab]); button.append(badge);
    }
  });
  const heading = tacticalRolesDialog.querySelector('.position-role-heading strong');
  if (heading) heading.textContent = ui({ roles: 'Roles', playstyles: 'Playstyles', stats: 'Detailed Stats', physical: 'Physical & Body' }[tacticalTab]);
}
function renderRoleFilterRows() {
  roleFilterList.replaceChildren();
  if (tacticalRolesDialog && ['roles', 'playstyles'].includes(tacticalTab)) {
    for (const [key, label] of [['minSm', 'Skill Moves'], ['minWf', 'Weak Foot']]) {
      const group = document.createElement('fieldset'); group.className = 'tactical-star-filter';
      const legend = document.createElement('legend'); legend.textContent = label; group.append(legend);
      for (const value of [0, 2, 3, 4, 5]) {
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = value === 0 ? 'Any' : value === 5 ? '★5' : `★${value}+`;
        button.setAttribute('aria-label', `${label} ${button.textContent}`);
        button.setAttribute('aria-pressed', String((tacticalSlotStars[selectedSlotPos]?.[key] ?? 0) === value));
        button.addEventListener('click', () => {
          tacticalSlotStars[selectedSlotPos] = { ...tacticalSlotStars[selectedSlotPos], [key]: value };
          renderRoleFilterRows();
          roleFilterList.querySelector(`[aria-label="${label} ${button.textContent}"]`)?.focus();
        });
        group.append(button);
      }
      roleFilterList.append(group);
    }
  }
  renderTacticalTabs();
  renderTacticalPitch();
  window.dispatchEvent(new Event('auto-build-context-change'));
  const selectedPositions = tacticalRolesDialog ? [normalizeChemistryPosition(selectedSlotPos)] : [...filters.positions];
  const subfilter = roleFilterList.closest('.position-role-subfilter');
  if (subfilter) subfilter.hidden = selectedPositions.length === 0;
  if (!tacticalRolesDialog && subfilter) subfilter.querySelector('.position-role-heading strong').textContent = ui('Roles');

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = 'role-all-chip';
  allChip.classList.toggle('is-selected', filters.selectedRoles.length === 0);
  allChip.setAttribute('aria-pressed', String(filters.selectedRoles.length === 0));
  allChip.textContent = tacticalRolesDialog ? ui('Clear slot role') : 'All / Any';
  allChip.addEventListener('click', () => {
    if (tacticalRolesDialog) {
      if (tacticalTab === 'stats') delete tacticalSlotStats[selectedSlotPos];
      else if (tacticalTab === 'physical') delete tacticalSlotPhysical[selectedSlotPos];
      else if (tacticalTab === 'playstyles') delete tacticalSlotPlaystyles[selectedSlotPos];
      else tacticalSlotRoles[selectedSlotPos] = null;
    } else {
      filters.selectedRoles = [];
      for (const key of Object.keys(tacticalSlotRoles)) delete tacticalSlotRoles[key];
    }
    renderRoleFilterRows();
    if (!tacticalRolesDialog) searchPlayers();
  });
  roleFilterList.append(allChip);

  if (tacticalRolesDialog && tacticalTab === 'stats') {
    allChip.textContent = ui('Clear slot Detailed Stats');
    const updateClear = () => {
      const empty = !activeStats(tacticalSlotStats[selectedSlotPos]).length;
      allChip.classList.toggle('is-selected', empty); allChip.setAttribute('aria-pressed', String(empty));
    };
    updateClear();
    roleFilterList.append(createSlotDetailedStats({
      value: tacticalSlotStats[selectedSlotPos], position: normalizeChemistryPosition(selectedSlotPos),
      onChange: value => {
        if (activeStats(value).length) tacticalSlotStats[selectedSlotPos] = value;
        else delete tacticalSlotStats[selectedSlotPos];
        updateClear(); renderTacticalPitch(); renderTacticalTabs();
        window.dispatchEvent(new Event('auto-build-context-change'));
      },
    }));
    return;
  }
  if (tacticalRolesDialog && tacticalTab === 'physical') {
    allChip.textContent = ui('Clear slot Physical & Body');
    allChip.classList.toggle('is-selected', !countPhysicalRequirements(tacticalSlotPhysical[selectedSlotPos]));
    allChip.setAttribute('aria-pressed', String(!countPhysicalRequirements(tacticalSlotPhysical[selectedSlotPos])));
    roleFilterList.append(createSlotPhysicalControls({
      value: tacticalSlotPhysical[selectedSlotPos],
      onChange: value => {
        if (countPhysicalRequirements(value)) tacticalSlotPhysical[selectedSlotPos] = value;
        else delete tacticalSlotPhysical[selectedSlotPos];
        allChip.classList.toggle('is-selected', !countPhysicalRequirements(value));
        allChip.setAttribute('aria-pressed', String(!countPhysicalRequirements(value)));
        renderTacticalPitch();
        renderTacticalTabs();
        window.dispatchEvent(new Event('auto-build-context-change'));
      },
    }));
    return;
  }
  if (tacticalRolesDialog && tacticalTab === 'playstyles') {
    allChip.textContent = ui('Clear slot Playstyle');
    if (tacticalPlaystylesStatus !== 'ready') {
      const status = document.createElement('p');
      status.textContent = tacticalPlaystylesStatus === 'loading' ? 'Loading Playstyles…' : 'Unable to load PlayStyles.';
      roleFilterList.append(status);
      if (tacticalPlaystylesStatus === 'error') {
        const retry = document.createElement('button');
        retry.type = 'button'; retry.textContent = 'Try Again';
        retry.addEventListener('click', loadPlaystyleFilterOptions);
        roleFilterList.append(retry);
      }
    } else roleFilterList.append(createPlaystylesGridSelector({
      selectedSlot: selectedSlotPos,
      playstylesList: tacticalPlaystylesList,
      currentReqList: tacticalSlotPlaystyles[selectedSlotPos] ?? [],
      onChange: requirement => {
        const focusedId = document.activeElement?.dataset.playstyleId;
        if (requirement.length) tacticalSlotPlaystyles[selectedSlotPos] = requirement;
        else delete tacticalSlotPlaystyles[selectedSlotPos];
        renderRoleFilterRows();
        if (focusedId) roleFilterList.querySelector('[data-playstyle-id="' + focusedId + '"]')?.focus();
      },
    }));
    return;
  }
  ROLE_DATA.filter(({ pos }) => selectedPositions.includes(pos)).forEach(({ pos, roles }) => {
    const group = document.createElement('section');
    group.className = 'role-filter-group';
    const heading = document.createElement('h3');
    heading.textContent = tacticalRolesDialog ? selectedSlotPos : pos;
    group.append(heading);
    roles.forEach((roleName) => {
      const roleIsActive = isRoleSelected(pos, roleName, 1) || isRoleSelected(pos, roleName, 2);
      const row = document.createElement('div');
      row.className = 'role-option-row';
      row.classList.toggle('is-active', roleIsActive);
      const roleChip = document.createElement('span');
      roleChip.className = 'role-name-chip';
      roleChip.textContent = roleName;

      const levels = document.createElement('div');
      levels.className = 'role-level-toggles';
      levels.setAttribute('aria-label', `${pos} ${roleName} Role level`);
      [1, 2].forEach((level) => {
        const selected = isRoleSelected(pos, roleName, level);
        const levelButton = document.createElement('button');
        levelButton.type = 'button';
        levelButton.textContent = level === 2 ? 'Role++' : 'Role+';
        levelButton.classList.toggle('is-selected', selected);
        levelButton.setAttribute('aria-pressed', String(selected));
        levelButton.setAttribute('aria-label', `${pos} ${roleName} ${level === 2 ? 'Role++' : 'Role+'} filters`);
        levelButton.addEventListener('click', () => {
          toggleRoleFilter(pos, roleName, level);
          renderRoleFilterRows();
          searchPlayers();
        });
        levels.append(levelButton);
      });
      row.append(roleChip, levels);
      group.append(row);
    });
    roleFilterList.append(group);
  });

}

function isRoleSelected(position, name, level) {
  if (tacticalRolesDialog) { const req = getRoleOptions().slotRequirements[selectedSlotPos]; return req?.roles?.some(role => role.name === name && role.minLevel === level) ?? false; }
  return filters.selectedRoles.some(
    (role) => role.position === position && role.name === name && role.level === level,
  );
}

function toggleRoleFilter(position, name, level) {
  if (tacticalRolesDialog) {
    const roles = getRoleOptions().slotRequirements[selectedSlotPos]?.roles ?? [];
    const existing = roles.find(role => role.name === name);
    tacticalSlotRoles[selectedSlotPos] = !existing ? [...roles, { name, minLevel: level }]
      : existing.minLevel === level ? roles.filter(role => role.name !== name)
        : roles.map(role => role.name === name ? { ...role, minLevel: level } : role);
    return;
  }
  const roleIndex = filters.selectedRoles.findIndex(
    (role) => role.position === position && role.name === name && role.level === level,
  );
  if (roleIndex >= 0) filters.selectedRoles.splice(roleIndex, 1);
  else {
    filters.selectedRoles = filters.selectedRoles.filter(role => role.position !== position);
    filters.selectedRoles.push({ position, name, level });
  }
}

function clearAllFilters() {
  Object.assign(filters, createDefaultFilters());
  for (const key of Object.keys(tacticalSlotRoles)) delete tacticalSlotRoles[key];
  for (const key of Object.keys(tacticalSlotPlaystyles)) delete tacticalSlotPlaystyles[key];
  for (const key of Object.keys(tacticalSlotStars)) delete tacticalSlotStars[key];
  for (const key of Object.keys(tacticalSlotPhysical)) delete tacticalSlotPhysical[key];
  for (const key of Object.keys(tacticalSlotStats)) delete tacticalSlotStats[key];
  resetStatInputs();

  playerNameSearch.value = '';
  minOvrInput.value = '';
  maxOvrInput.value = '';
  minPriceInput.value = '';
  maxPriceInput.value = '';
  onlyPrimaryPositions.checked = false;
  hasAllSelectedPositions.checked = false;
  requireAllPlaystyles.checked = false;
  minPlaystylesInput.value = '';
  maxPlaystylesInput.value = '';
  minPlaystylesPlusInput.value = '';
  maxPlaystylesPlusInput.value = '';
  [minHeightInput, maxHeightInput, minWeightInput, maxWeightInput, minAgeInput, maxAgeInput].forEach((input) => { input.value = ''; });
  nationFilter.value = '';
  renderSearchableSelect(nationFilter, affiliationCatalog.nations);
  leagueFilter.value = '';
  renderSearchableSelect(leagueFilter, affiliationCatalog.leagues);
  renderClubOptions();

  document.querySelectorAll('[data-position-filter]').forEach((button) => {
    button.classList.remove('is-selected');
    button.setAttribute('aria-pressed', 'false');
  });
  document.querySelectorAll('[data-rating-filter]').forEach((button) => button.classList.remove('is-selected'));
  document.querySelectorAll('[data-misc-filter]').forEach((button) => button.classList.remove('is-selected'));
  document.querySelectorAll('[data-rarity-filter]').forEach((button) => {
    button.classList.remove('is-selected');
    button.setAttribute('aria-pressed', 'false');
  });
  document.querySelectorAll('.playstyle-filter-button').forEach((button) => {
    button.classList.remove('is-selected');
    button.setAttribute('aria-pressed', 'false');
  });
  renderRoleFilterRows();
  resetDualRangeControls();
  searchPlayers();
}

function normalizeBrowserPlayerCard(cardVersion) {
  const positionRows = asArray(cardVersion.card_positions);
  const primaryRow = positionRows.find((row) => row.is_primary) ?? positionRows[0] ?? {};
  const primaryPosition = unwrapRelation(primaryRow.positions)?.name ?? '';
  const card = normalizePlayerCard({
    card_versions: cardVersion,
    positions: primaryRow.positions,
    is_primary: primaryRow.is_primary,
  });
  if (!card) return null;

  return {
    ...card,
    summary_only: cardVersion.summary_only === true,
    primary_position: primaryPosition,
    alt_positions: positionRows.filter(row => row !== primaryRow).map(row => unwrapRelation(row.positions)?.name).filter(Boolean),
    secondary_positions: [...new Set(
      positionRows
        .filter((row) => row !== primaryRow)
        .map((row) => unwrapRelation(row.positions)?.name)
        .filter(Boolean),
    )],
  };
}

function createValueScoreBadge(valueScore) {
  const grade = getValueScoreGrade(valueScore);
  const tone = { 'Good Value': 'good', 'Average Value': 'average', 'Poor Value': 'poor' }[grade];
  const badge = document.createElement('small');
  badge.className = `value-score-badge value-score-${tone}`;
  badge.textContent = grade;
  badge.setAttribute('aria-label', `Value rating: ${grade}`);
  return badge;
}

function renderPlayerGrid(cards, scrollPositions = null) {
  playerGrid.classList.remove('is-loading');
  playerGrid.replaceChildren();
  playerResultCount.textContent = `Showing ${cards.length}`;
  if (!cards.length) {
    renderPlayerGridMessage('No matching players. Try adjusting your filters.', false, scrollPositions);
    return;
  }

  cards.forEach((card) => {
    playerGrid.append(buildPlayerCard(card, { onActivate: playerDetail.open }));
  });
  restorePlayerPanelScrollPositions(scrollPositions);
}

function renderPlayerGridMessage(message, isError = false, scrollPositions = null) {
  playerGrid.classList.remove('is-loading');
  const text = document.createElement('p');
  text.className = isError ? 'players-grid-message error' : 'players-grid-message';
  text.textContent = message;
  playerGrid.replaceChildren(text);
  if (isError) playerResultCount.textContent = 'Unable to load search results.';
  restorePlayerPanelScrollPositions(scrollPositions);
}

function setPlayerGridLoading() {
  if (playerGrid.childElementCount) {
    playerGrid.classList.add('is-loading');
    playerResultCount.textContent = 'Loading players…';
    return;
  }
  renderPlayerGridMessage('Loading players…');
}

function capturePlayerPanelScrollPositions() {
  const resultsPanel = document.querySelector('.players-results');
  const filtersPanel = document.querySelector('.players-filters');
  return {
    results: resultsPanel?.scrollTop ?? 0,
    filters: filtersPanel?.scrollTop ?? 0,
  };
}

function restorePlayerPanelScrollPositions(scrollPositions) {
  if (!scrollPositions) return;
  window.requestAnimationFrame(() => {
    const resultsPanel = document.querySelector('.players-results');
    const filtersPanel = document.querySelector('.players-filters');
    if (resultsPanel) resultsPanel.scrollTop = scrollPositions.results;
    if (filtersPanel) filtersPanel.scrollTop = scrollPositions.filters;
  });
}

const emptySlotTabs = createEmptySlotTabState();
const lockedSquadCount = () => Object.entries(squad).filter(([position, entry]) => position !== activeSlot?.dataset.position && entry?.card).length;
let recommendationSort = 'all_meta';
let myEvos = false;
mountSavedEvos();
window.addEventListener('auto-build-context-change', () => {
  const next = emptySlotTabs.active(lockedSquadCount());
  if (myEvos || next === recommendationSort) return;
  recommendationSort = next;
  if (!modal.hidden && activeSlot) { renderRecommendationControls(); updateModalPlayerSearch(); }
});
let slotMaxPrice;
let includeAcquisitionCards = true;
let recommendationControls;
let recommendationRows = new Map();
const recommendationPanel = document.createElement('section');
const modalAffiliation = createModalAffiliationFilter({ modal, onChange: () => { renderRecommendationControls(); updateModalPlayerSearch(); }, onRetry: loadAffiliationFilterOptions });
modalAffiliation.setCatalog(affiliationCatalog);
recommendationPanel.className = 'slot-recommendations';
recommendationPanel.hidden = true;
document.querySelector('.modal-player-search')?.after(recommendationPanel);
// Keep controls immediately below the search row across desktop/mobile layouts.
if (!recommendationPanel.isConnected) modalPlayerSearchInput.parentElement.after(recommendationPanel);
const recommendationText = (ko, en) => getLanguage() === 'ko' ? ko : en;
function recommendationEnabled() {
  return !!activeSlot;
}
function recommendationOptions() {
  return { ...excludedCardVersionsStore.getState(), ...getRoleOptions(), currentSquad: squad,
    affiliation: modalAffiliation.getValue(), manager: managerState, includeAcquisitionCards,
    formation: currentFormation, slotPosition: activeSlot.dataset.position,
    totalBudget: targetBudget, slotMaxPrice, sort: recommendationSort === 'chem_boost' ? 'instant_chem' : recommendationSort, excludeZeroPriceCards: true };
}
function modalPriceCap() {
  return recommendationEnabled() ? getEmptySlotPriceCap(recommendationOptions()) : slotMaxPrice;
}
function renderRecommendationControls() {
  modalAffiliation.close();
  document.querySelector('.modal-player-search').append(modalAffiliation.element);
  recommendationPanel.hidden = !activeSlot;
  recommendationPanel.replaceChildren();
  if (recommendationPanel.hidden) return;
  const count = lockedSquadCount();
  const header = document.createElement('h3');
  header.textContent = count ? recommendationText(`배치 선수(${count}명) 기준 맞춤 추천`, `Recommended for Pitch Squad (${count})`)
    : recommendationText('포지션별 메타 추천', 'Meta Recommendations');
  recommendationControls?.dispose();
  recommendationControls = createRecommendationControls({
    includeAcquisitionCards,
    onIncludeAcquisitionCards: myEvos ? undefined : value => { includeAcquisitionCards = value; renderRecommendationControls(); updateModalPlayerSearch(); },
    lockedCount: count, sort: myEvos ? 'my_evos' : recommendationSort, totalBudget: targetBudget, maxPrice: getEmptySlotPriceCap(recommendationOptions()),
    onInvalidate: () => { modalAbort?.abort(); modalRequest++; },
    onSort: value => { playerList.querySelector('.saved-evos-list')?.resetDeleteConfirmation?.(); myEvos = false; recommendationSort = emptySlotTabs.select(value, lockedSquadCount()); renderRecommendationControls(); updateModalPlayerSearch(); },
    onPrice: value => { slotMaxPrice = value; renderRecommendationControls(); updateModalPlayerSearch(); },
  });
  const evoTab = document.createElement('button'); evoTab.type = 'button';
  evoTab.textContent = recommendationText(`커스텀 카드 (${savedEvosStore.entries.length}/10)`, `Custom Cards (${savedEvosStore.entries.length}/10)`);
  evoTab.setAttribute('aria-pressed', String(myEvos));
  evoTab.onclick = () => { playerList.querySelector('.saved-evos-list')?.resetDeleteConfirmation?.(); myEvos = true; renderRecommendationControls(); updateModalPlayerSearch(); };
  recommendationControls.element.querySelector('.recommendation-tabs').append(evoTab);
  recommendationPanel.append(header, recommendationControls.element);

}
async function loadSlotRecommendations() {
  const requestId = modalRequest;
  modalAbort?.abort(); modalAbort = new AbortController();
  recommendationRows.clear(); modalLoadMore.hidden = true;
  const loading = document.createElement('div'); loading.className = 'alternative-loading recommendation-loading';
  loading.setAttribute('role', 'status');
  const spinner = document.createElement('span'); spinner.className = 'alternative-spinner';
  loading.append(spinner, document.createTextNode(recommendationText('맞춤 추천 선수를 찾는 중…', 'Finding recommended players…')));
  playerList.replaceChildren(loading);
  modalDescription.textContent = recommendationText('현재 스쿼드 기준 추천', 'Recommendations for your current squad');
  try {
    const rows = await getRecommendedPlayersForEmptySlot(supabase, recommendationOptions(), undefined, modalAbort.signal);
    if (requestId !== modalRequest || modal.hidden) return;
    recommendationRows = new Map(rows.map(row => [String(row.card.id), row]));
    renderPlayerList(rows.map(row => {
      const card = normalizeBrowserPlayerCard(row.card);
      return card ? { ...card, meta_score: Number.isFinite(row.metaScore) ? row.metaScore : null, score_position: activeSlot.dataset.position } : null;
    }).filter(Boolean));
    if (!rows.length) renderMessage(recommendationText('조건에 맞는 추천 선수가 없습니다. 가격이나 설정을 변경해 보세요.', 'No recommendations match. Try changing the price or settings.'));
  } catch (error) {
    if (requestId === modalRequest && !modal.hidden) renderMessage(recommendationText('추천 선수를 불러오지 못했습니다: ', 'Unable to load recommendations: ') + error.message, true);
  }
}
subscribeLanguage(() => {
  modalAffiliation.refresh();
  if (tacticalRolesDialog) renderRoleFilterRows();
  if (!modal.hidden && activeSlot) { renderRecommendationControls(); updateModalPlayerSearch(); }
});

async function openPlayerModal(slot, allowReplace = false) {
  if (!allowReplace && isSquadSlotLocked(squad[slot.dataset.position])) return;
  activeSlot = slot; myEvos = false;
  modalAffiliation.reset();
  slotMaxPrice = undefined; includeAcquisitionCards = true; recommendationSort = emptySlotTabs.select('all_meta', lockedSquadCount());
  renderRecommendationControls();
  modalPlayerCards = [];
  modalPlayerSearchInput.value = '';
  modalPlayerSearchClear.hidden = true;
  setModalPositionMode('all');
  const position = slot.dataset.position;
  resetMobileZoom(modal);
  modal.hidden = false;
  modalTitle.textContent = `Select ${formatSlotPosition(position)}`;
  modalDescription.textContent = `Loading ${position} players…`;
  renderMessage('Loading players…');

  resetModalSearch();
  const focusRequest = modalRequest;
  const isDesktopPointer = typeof window !== 'undefined'
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches
    && window.innerWidth >= 768;
  if (isDesktopPointer) requestAnimationFrame(() => {
    if (!modal.hidden && activeSlot === slot && modalRequest === focusRequest) {
      modalPlayerSearchInput.focus({ preventScroll: true });
    }
  });
  await loadModalPlayerPage();
}

function resetModalSearch() {
  clearTimeout(modalSearchTimer);
  modalAbort?.abort();
  modalRequest += 1;
  modalPager.reset();
  recommendationRows.clear();
  modalPlayerCards = [];
  modalLoadMore.hidden = true;
  const ready = isSearchTermReady(modalPlayerSearchInput.value);
  if (!ready || !searchResultCache.has(modalResultKey())) {
    renderMessage(ready ? 'Loading players…' : 'Enter at least 2 characters to search.');
  }
  if (!ready) modalDescription.textContent = 'Enter at least 2 characters to search.';
}

async function loadModalPlayerPage() {
  if (myEvos && activeSlot && !modal.hidden) { renderMyEvos(); return; }
  if (!modal.hidden && recommendationEnabled() && !modalPlayerSearchInput.value.trim()) return loadSlotRecommendations();
  if (modal.hidden || !activeSlot || !isSearchTermReady(modalPlayerSearchInput.value)) return;
  const ticket = modalPager.begin();
  if (!ticket) return;
  const requestId = modalRequest;
  const position = activeSlot.dataset.position;
  const cacheKey = modalResultKey(ticket.offset);
  const cached = searchResultCache.get(cacheKey);
  modalAbort = new AbortController();
  modalLoadMore.disabled = true;
  if (!cached) modalLoadMore.textContent = 'Loading…';
  try {
    const rows = cached ?? await fetchModalPlayerPage(supabase, {
      position: normalizePosition(position), keyword: modalPlayerSearchInput.value,
      positionMode: modalPositionMode,
      affiliation: modalAffiliation.getValue(), maxPrice: modalPriceCap(), includeAcquisitionCards,
      offset: ticket.offset, signal: modalAbort.signal,
    });
    cacheSearchResult(cacheKey, rows);
    if (requestId !== modalRequest || modal.hidden) return;
    const selectedCardIds = getSelectedCardIds(position);
    const cards = rows.map(normalizeBrowserPlayerCard).filter(Boolean)
      .filter(card => !selectedCardIds.has(String(card.id)));
    const portraitsReady = preloadCardImages(cards);
    if (portraitsReady) {
      modalLoadMore.textContent = 'Loading…';
      if (!ticket.offset) renderMessage('Loading players…');
      await portraitsReady;
    }
    if (requestId !== modalRequest || modal.hidden) return;
    if (!modalPager.complete(ticket, rows, cards)) return;
    modalDescription.textContent = `${normalizePosition(position)} · ${modalPager.state.cards.length} Players · ${modalPositionLabels[modalPositionMode]}`;
    renderPlayerList(modalPager.state.cards);
    if (!modalPager.state.cards.length) renderMessage(modalPager.state.hasMore
      ? 'No available players on this page. Select Load More to continue.'
      : 'No matching players.');
  } catch (error) {
    if (requestId !== modalRequest || modal.hidden) return;
    modalPager.fail(ticket);
    modalDescription.textContent = 'Unable to load players. Select Load More to try again.';
    if (!modalPager.state.cards.length) renderMessage('Database connection error: ' + error.message, true);
  } finally {
    if (requestId === modalRequest && !modal.hidden) {
      modalLoadMore.hidden = !modalPager.state.hasMore;
      modalLoadMore.disabled = false;
      modalLoadMore.textContent = `Load More (${MODAL_PAGE_SIZE} Players)`;
    }
  }
}

function getSelectedCardIds(currentSlotKey) {
  return new Set(
    Object.entries(squad)
      .filter(([slotKey, item]) => slotKey !== currentSlotKey && item?.card_id !== undefined && item.card_id !== null)
      .map(([, item]) => String(item.card_id)),
  );
}

function normalizePosition(slot) {
  return normalizeChemistryPosition(slot);
}

function normalizePlayerCard(row) {
  const cardVersion = unwrapRelation(row.card_versions);
  if (!cardVersion) return null;

  const player = unwrapRelation(cardVersion.players) ?? {};
  const stats = unwrapRelation(cardVersion.player_stats) ?? {};
  const position = unwrapRelation(row.positions) ?? {};
  const playstyles = normalizePlaystyles(cardVersion, player, row);

  return {
    id: cardVersion.id,
    player_id: cardVersion.player_id ?? player.id,
    version: cardVersion.version,
    card_type: cardVersion.card_type,
    sbc_price: cardVersion.sbc_price,
    token_cost: cardVersion.token_cost,
    season_pass_level: cardVersion.season_pass_level,
    overall: cardVersion.overall,
    sm: cardVersion.sm,
    wf: cardVersion.wf,
    price: cardVersion.price,
    club: unwrapRelation(cardVersion.clubs)?.name,
    clubs: unwrapRelation(cardVersion.clubs),
    club_short_name: unwrapRelation(cardVersion.clubs)?.short_name,
    club_id: cardVersion.club_id,
    league: unwrapRelation(cardVersion.leagues)?.name,
    leagues: unwrapRelation(cardVersion.leagues),
    league_short_name: unwrapRelation(cardVersion.leagues)?.short_name,
    league_id: cardVersion.league_id,
    image_url: cardVersion.image_url,
    background_url: cardVersion.background_url,
    name: player.name,
    nation: unwrapRelation(player.nations)?.name,
    nation_flag_url: unwrapRelation(player.nations)?.flag_url,
    nation_id: player.nation_id,
    long_name: player.long_name,
    height: player.height,
    weight: player.weight,
    age: player.age,
    gender: player.gender,
    preferred_foot: cardVersion.preferred_foot,
    accele_type: cardVersion.accele_type,
    body_type: cardVersion.body_type,
    body_type_group: cardVersion.body_type_group,
    position: position.name,
    is_primary: row.is_primary,
    pac: stats.pac,
    sho: stats.sho,
    pas: stats.pas,
    dri: stats.dri,
    def: stats.def,
    phy: stats.phy,
    gk_reflexes: stats.gk_reflexes,
    gk_diving: stats.gk_diving,
    gk_positioning: stats.gk_positioning,
    gk_handling: stats.gk_handling,
    reactions: stats.reactions,
    playstyles,
    raw: cardVersion,
    // card_roles는 Supabase가 배열로 반환합니다. 렌더링 시 이 원본 배열을 직접 순회합니다.
    card_roles: asArray(cardVersion.card_roles),
  };
}

function normalizePlayerCardRows(rows) {
  const rowsByCard = new Map();
  rows.forEach((row) => {
    const cardVersion = unwrapRelation(row.card_versions);
    if (!cardVersion?.id) return;
    const key = String(cardVersion.id);
    if (!rowsByCard.has(key)) rowsByCard.set(key, []);
    rowsByCard.get(key).push(row);
  });

  return [...rowsByCard.values()].map((cardRows) => {
    const primaryRow = cardRows.find((row) => row.is_primary) ?? cardRows[0];
    const normalized = normalizePlayerCard(primaryRow);
    if (!normalized) return null;
    const primaryPosition = unwrapRelation(primaryRow.positions)?.name ?? normalized.position;
    const altPositions = [...new Set(cardRows
      .filter((row) => row !== primaryRow)
      .map((row) => unwrapRelation(row.positions)?.name)
      .filter(Boolean))];
    return {
      ...normalized,
      position: primaryPosition,
      primary_position: primaryPosition,
      alt_positions: altPositions,
      secondary_positions: altPositions,
    };
  }).filter(Boolean);
}

function unwrapRelation(value) {
  return Array.isArray(value) ? value[0] : value;
}

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function parsePlaystyleSource(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function getPlayStyles(player) {
  const raw = player?.raw;
  const nestedPlayer = unwrapRelation(raw?.players);
  return normalizePlaystyles(player, raw, nestedPlayer).map(style => {
    // Older saved/locked squads can contain names without image URLs.
    const master = tacticalPlaystylesList.find(item => item.name?.toLowerCase() === style.name.toLowerCase());
    return {
      ...style,
      image_url: style.image_url || master?.image_url,
      image_url_plus: style.image_url_plus || master?.image_url_plus,
    };
  });
}

function getRoles(player) {
  const normalized = new Map();

  const addSource = (source, forcedLevel = null) => {
    const parsed = parsePlaystyleSource(source);
    asArray(parsed).forEach((entry) => {
      const safeEntry = parsePlaystyleSource(entry);
      if (Array.isArray(safeEntry)) {
        safeEntry.forEach((item) => addSource(item, forcedLevel));
        return;
      }
      if (typeof safeEntry === 'string') {
        const name = safeEntry.trim();
        if (name) normalized.set(`|${name.toLowerCase()}|${forcedLevel ?? 1}`, { position: '', name, level: forcedLevel ?? 1 });
        return;
      }
      if (!safeEntry || typeof safeEntry !== 'object') return;

      const relation = unwrapRelation(
        safeEntry.roles ?? safeEntry.role ?? safeEntry.player_roles ?? safeEntry.role_data,
      );
      const sourceObject = relation && typeof relation === 'object' ? relation : safeEntry;
      const position = sourceObject.position ?? sourceObject.pos ?? safeEntry.position ?? '';
      const name = sourceObject.role_name ?? sourceObject.roleName ?? sourceObject.name
        ?? sourceObject.label ?? safeEntry.role_name ?? safeEntry.roleName;
      if (typeof name !== 'string' || !name.trim()) return;

      const rawLevel = forcedLevel ?? safeEntry.role_level ?? safeEntry.roleLevel
        ?? safeEntry.level ?? sourceObject.role_level ?? sourceObject.level ?? 1;
      const numericLevel = Number(rawLevel);
      const level = numericLevel >= 2 || (typeof rawLevel === 'string' && rawLevel.includes('++')) ? 2 : 1;
      const cleanPosition = typeof position === 'string' ? position.trim() : String(position ?? '');
      const cleanName = name.trim().replace(/\+{1,2}$/, '').trim();
      normalized.set(`${cleanPosition.toLowerCase()}|${cleanName.toLowerCase()}|${level}`, {
        position: cleanPosition,
        name: cleanName,
        level,
      });
    });
  };

  const raw = player?.raw;
  const nestedPlayer = unwrapRelation(raw?.players);
  [player, raw, nestedPlayer].filter((record) => record && typeof record === 'object').forEach((record) => {
    [record.card_roles, record.roles, record.player_roles].forEach((source) => addSource(source));
    [record.role_plus, record.roles_plus, record.rolePlus, record.rolesPlus].forEach((source) => addSource(source, 1));
    [record.role_plus_plus, record.roles_plus_plus, record.rolePlusPlus, record.rolesPlusPlus].forEach((source) => addSource(source, 2));
  });

  return [...normalized.values()];
}

function renderPlayerList(cards) {
  modalPlayerCards = cards;
  renderFilteredPlayerList();
}

function updateModalPlayerSearch() {
  modalPlayerSearchClear.hidden = !modalPlayerSearchInput.value;
  resetModalSearch();
  if (myEvos) { renderMyEvos(); return; }
  if (recommendationEnabled() && !modalPlayerSearchInput.value.trim()) { loadSlotRecommendations(); return; }
  if (!isSearchTermReady(modalPlayerSearchInput.value)) return;
  if (searchResultCache.has(modalResultKey())) {
    loadModalPlayerPage();
    return;
  }
  modalSearchTimer = setTimeout(() => loadModalPlayerPage(), 180);
}

function evoUnavailable(item, position) {
  return getSelectedCardIds(position).has(String(toChemistryPlayerCard(item.player).id));
}
function placeSavedEvo(slot, item) {
  if (evoUnavailable(item, slot.dataset.position)) return;
  placeCard(slot, item.player, true, { originalCard: item.player, customOverrides: item.customOverrides, isLocked: true });
  updateSlotLockUI(slot);
  window.dispatchEvent(new Event('auto-build-context-change'));
}
function removeSavedEvoFromPitch(item) {
  const id = evoCardId(item.player);
  const removed = [];
  if (!id) return removed;
  document.querySelectorAll('.slot').forEach(slot => {
    const entry = squad[slot.dataset.position];
    if (!entry?.card || evoCardId(entry.originalCard ?? entry.card) !== id) return;
    removed.push(slot.dataset.position);
    resetSlot(slot, false);
  });
  if (removed.length) updateSquadChemistry();
  if (!modal.hidden && activeSlot && myEvos) renderMyEvos();
  return removed;
}
function renderMyEvos() {
  if (!activeSlot) return;
  modalLoadMore.hidden = true;
  modalDescription.textContent = recommendationText('저장된 커스텀 선수를 선택하세요.', 'Select a saved custom player.');
  playerList.replaceChildren(createSavedEvosList({ query: modalPlayerSearchInput.value, position: normalizePosition(activeSlot.dataset.position),
    unavailable: item => evoUnavailable(item, activeSlot.dataset.position),
    onDeleted: removeSavedEvoFromPitch,
    select: item => { if (!activeSlot || evoUnavailable(item, activeSlot.dataset.position)) return; const slot = activeSlot; placeSavedEvo(slot, item); closeModal(); },
  }));
}
savedEvosStore.subscribe(() => { if (!modal.hidden && activeSlot) { renderRecommendationControls(); if (myEvos) renderMyEvos(); } });

function buildPlayerCard(card, options) {
  return createPlayerCard(card, {
    getCardName, getCardRating, getCardPosition, getChemistryEntityLogo,
    createPlaystyleBadges, unwrapRelation, affiliationCatalog, createReviewButton, onShowDetails: playerDetail.open, ...options,
  });
}

function renderFilteredPlayerList() {
  playerList.replaceChildren();
  modalPlayerCards.forEach(card => {
    const recommendation = recommendationRows.get(String(card.id));
    const badge = recommendation ? emptySlotRecommendationBadge(recommendation, lockedSquadCount()) : null;
    const article = buildPlayerCard(card, {
      actionLabel: recommendation ? recommendationText('선수 선택', 'Select Player') : 'Select Player',
      textAffiliations: false,
      synergyBadge: badge?.text,
      onActivate: async () => {
        if (!activeSlot) return;
        const slot = activeSlot;
        const requestId = modalRequest;
        const selectionId = ++modalSelectionRequest;
        article.setAttribute('aria-busy', 'true');
        try {
          const detail = normalizeBrowserPlayerCard(await loadPlayerDetail(supabase, card.id));
          if (selectionId !== modalSelectionRequest || requestId !== modalRequest || activeSlot !== slot || modal.hidden) return;
          if (!detail) throw new Error('Unable to load player details.');
          placeCard(slot, detail);
          if (recommendation) {
            squad[slot.dataset.position].isLocked = true;
            squad[slot.dataset.position].isOwned = false;
            updateSlotLockUI(slot);
            window.dispatchEvent(new Event('auto-build-context-change'));
          }
          status.textContent = `Added ${getCardName(detail)} at ${slot.dataset.position}.`;
          closeModal();
        } catch (error) {
          if (selectionId === modalSelectionRequest && requestId === modalRequest) modalDescription.textContent = `Unable to load player details. Please select the player again. (${error.message})`;
        } finally {
          article.removeAttribute('aria-busy');
        }
      },
    });
    if (badge?.tone) article.querySelector('.recommendation-badge')?.classList.add(badge.tone);
    playerList.append(article);
  });
}

function renderMessage(message, isError = false) {
  const text = document.createElement('p');
  text.className = isError ? 'list-message error' : 'list-message';
  text.textContent = message;
  playerList.replaceChildren(text);
}

function closeModal() {
  playerList.querySelector('.saved-evos-list')?.resetDeleteConfirmation?.();
  modalAffiliation.reset();
  recommendationControls?.dispose();
  clearTimeout(modalSearchTimer);
  modalAbort?.abort();
  modalPager.reset();
  modal.hidden = true;
  modalRequest += 1;
  activeSlot = null;
  modalPlayerCards = [];
}

function handleRemovePlayer(event, slotKey) {
  event.stopPropagation();

  const slot = document.querySelector(`.slot[data-position="${slotKey}"]`);
  if (!slot) return;

  resetSlot(slot, false);
  status.textContent = `Removed player from ${slotKey}.`;
  updateSquadChemistry();
}

function resetSlot(slot, shouldUpdate = true) {
  const slotKey = slot.dataset.position;
  squad[slotKey] = null;
  delete slot.dataset.card;
  delete slot.dataset.cardId;
  slot.draggable = false;
  slot.style.removeProperty('background-image');
  slot.classList.remove('occupied', 'is-locked', 'is-owned', 'is-out-of-position', 'is-dragging', 'is-drop-target');
  slot.replaceChildren();

  const positionLabel = document.createElement('span');
  slot.classList.remove('is-excluded');
  positionLabel.textContent = formatSlotPosition(slotKey);
  slot.append(positionLabel);
  if (shouldUpdate) updateSquadChemistry();
}

function openPitchDetail(slot) {
  const position = slot.dataset.position;
  const entry = squad[position]; if (!entry?.card) return;
  playerDetail.open(entry.card, { getPitchCard: () => squad[position]?.card, customPanel: createSlotCustomPanel({
    db: supabase, getEntry: () => squad[position], position: normalizePosition(position),
    unavailable: item => evoUnavailable(item, position),
    onDeleted: item => { if (removeSavedEvoFromPitch(item).includes(position)) playerDetail.close(); },
    loadEvo: item => { placeSavedEvo(slot, item); playerDetail.refresh(squad[position].card); },
    change: custom => {
      const previous = squad[position]; if (!previous) return;
      const customOverrides = sanitizeCustom(custom);
      const isLocked = !hasCustom(previous.customOverrides) && hasCustom(customOverrides) ? true : previous.isLocked;
      placeCard(slot, previous.originalCard ?? previous.card, false, { ...previous, isLocked, customOverrides });
      updateSquadChemistry(); playerDetail.refresh(squad[position].card);
    },
    replace: () => { playerDetail.close(); openPlayerModal(slot, true); },
    remove: () => { playerDetail.close(); resetSlot(slot); },
  }) });
}
function placeCard(slot, card, shouldUpdate = true, state = {}) {
  const originalCard = state.originalCard ?? card;
  const customOverrides = sanitizeCustom(state.customOverrides);
  card = applySlotCustom(originalCard, customOverrides);
  preloadImages([{ card }]);
  const name = getCardName(card);
  const chemistryCard = toChemistryPlayerCard(card);
  slot.dataset.card = name;
  slot.dataset.cardId = chemistryCard.id;
  squad[slot.dataset.position] = createSquadEntry(chemistryCard.id, card, chemistryCard);
  Object.assign(squad[slot.dataset.position], { originalCard, customOverrides, isLocked: state.isLocked === true });
  squad[slot.dataset.position].isOwned = state.isOwned === true;
  slot.draggable = hasDesktopPointer();
  slot.classList.add('occupied');
  slot.style.removeProperty('background-image');
  slot.classList.remove('is-locked');
  slot.replaceChildren();
  const body = document.createElement('span');
  body.className = 'slot-card-body';

  const top = document.createElement('span');
  top.className = 'slot-card-top';
  slot.append(top, body);

  const cardActions = document.createElement('span');
  cardActions.className = 'slot-card-actions';
  const lockButton = document.createElement('button');
  lockButton.className = 'lock-player';
  lockButton.type = 'button';
  lockButton.addEventListener('click', (event) => handleTogglePlayerLock(event, slot));

  const ownedButton = document.createElement('button');
  ownedButton.className = 'owned-player';
  ownedButton.type = 'button';
  ownedButton.addEventListener('click', (event) => handleTogglePlayerOwned(event, slot));

  const detailButton = document.createElement('button');
  detailButton.className = 'detail-player';
  detailButton.type = 'button';
  setCardAction(detailButton, 'details');
  detailButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg>';
  detailButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const selectedCard = squad[slot.dataset.position]?.card;
    if (selectedCard) openPitchDetail(slot);
  });
  const alternativeButton = document.createElement('button');
  alternativeButton.type = 'button';
  alternativeButton.className = 'alternative-player';
  alternativeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H4m12-4 4 4-4 4M4 17h16M8 13l-4 4 4 4"/></svg>';
  setCardAction(alternativeButton, 'swapPosition');
  alternativeButton.addEventListener('click', event => {
    event.stopPropagation();
    openSwapModal(slot.dataset.position, squad[slot.dataset.position]?.card);
  });
  cardActions.append(lockButton, ownedButton, createPitchExcludeButton(card), detailButton, alternativeButton);
  cardActions.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
    button.addEventListener('pointerdown', event => { event.stopPropagation(); });
    button.addEventListener('dragstart', event => { event.preventDefault(); event.stopPropagation(); });
  });
  top.append(cardActions);
  syncPitchExclusions();
  updateSlotLockUI(slot);
  updateSlotOwnedUI(slot);

  body.append(createPitchMiniCard(card, getPlayStyles(card), affiliationCatalog, { createReviewButton }));
  if (hasCustom(customOverrides)) { const badge = document.createElement('span'); badge.className = 'pitch-custom-badge'; badge.textContent = customOverrides.forceFullChem ? '3✦' : 'EVO'; body.append(badge); }
  const priceBadge = document.createElement('div');
  priceBadge.className = 'card-price-badge';
  slot.append(priceBadge);
  updateSlotOwnedUI(slot);
  if (shouldUpdate) updateSquadChemistry();
}

function handleTogglePlayerLock(event, slot) {
  event.stopPropagation();
  const entry = squad[slot.dataset.position];
  if (!entry?.card) return;

  const isLocked = toggleSquadSlotLock(entry);
  persistCurrentSquad();
  window.dispatchEvent(new Event('auto-build-context-change'));
  updateSlotLockUI(slot);
  event.currentTarget.blur();
  status.textContent = `${getCardName(entry.card)} ${isLocked ? 'locked.' : 'unlocked.'}`;
}

function updateSlotLockUI(slot) {
  const entry = squad[slot.dataset.position];
  const isLocked = isSquadSlotLocked(entry);
  const lockButton = slot.querySelector('.lock-player');

  slot.classList.toggle('is-locked', isLocked);
  slot.draggable = hasDesktopPointer() && Boolean(entry?.card) && !isLocked;
  const removeButton = slot.querySelector('.remove-player');
  if (isLocked || !entry?.card) removeButton?.remove();
  else if (!removeButton) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'remove-player'; button.textContent = '×';
    setCardAction(button, 'remove');
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      if (!isSquadSlotLocked(squad[slot.dataset.position])) handleRemovePlayer(event, slot.dataset.position);
    });
    button.addEventListener('dragstart', event => { event.preventDefault(); event.stopPropagation(); });
    slot.querySelector('.slot-card-actions')?.append(button);
  }
  if (lockButton) {
    lockButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="${isLocked ? 'M8 10V6a4 4 0 0 1 8 0v4' : 'M8 10V6a4 4 0 0 1 8 0'}"/><path d="M12 14v3"/></svg>`;
    setCardAction(lockButton, isLocked ? 'unlock' : 'lock');
    lockButton.setAttribute('aria-pressed', String(isLocked));
  }
  const alternativeButton = slot.querySelector('.alternative-player');
  if (alternativeButton) alternativeButton.disabled = false;
}

function handleTogglePlayerOwned(event, slot) {
  event.stopPropagation();
  const entry = squad[slot.dataset.position];
  if (!entry?.card) return;
  entry.isOwned = !entry.isOwned;
  updateSlotOwnedUI(slot);
  updateSquadChemistry();
  status.textContent = `${getCardName(entry.card)} marked as ${entry.isOwned ? 'owned.' : 'not owned.'}`;
}

function updateSlotOwnedUI(slot) {
  const entry = squad[slot.dataset.position];
  if (!entry?.card) return;
  const isOwned = entry.isOwned === true;
  const ownedButton = slot.querySelector('.owned-player');
  const priceBadge = slot.querySelector('.card-price-badge');
  const formattedPrice = new Intl.NumberFormat('en-US').format(getCardCoinPrice(entry.card));
  slot.classList.toggle('is-owned', isOwned);
  if (ownedButton) {
    ownedButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m7.5 12.2 3 3 6-6.4"></path></svg>';
    setCardAction(ownedButton, isOwned ? 'notOwned' : 'owned');
    ownedButton.setAttribute('aria-pressed', String(isOwned));
  }
  if (priceBadge) {
    priceBadge.replaceChildren();
    if (isOwned && getCardCost(entry.card).kind === 'market') {
      const originalPrice = document.createElement('s');
      originalPrice.textContent = formattedPrice;
      priceBadge.append(originalPrice, document.createTextNode(' → 0 C'));
    } else {
      priceBadge.append(CardCostBadge(entry.card, { compact: true }));
    }
  }
}

function clearAllPlayers() {
  const hadManager = Boolean(managerState);
  const clearedSlots = Object.keys(squad).filter(key => squad[key]);
  playerDetail.close();
  clearedSlots.forEach((slotKey) => {
    const slot = document.querySelector(`.slot[data-position="${slotKey}"]`);
    if (slot) resetSlot(slot, false);
  });
  managerState = null;
  renderManagerSlot();
  status.textContent = clearedSlots.length || hadManager
    ? `Cleared ${clearedSlots.length} players and manager settings.`
    : 'No players to clear.';
  updateSquadChemistry();
  squadAutosave.flush();
}

function openManagerModal() {
  managerLeagueSelect.value = managerState?.leagueId ?? '';
  managerNationSelect.value = managerState?.nationId ?? '';
  renderSearchableSelect(managerLeagueSelect, affiliationCatalog.leagues);
  renderSearchableSelect(managerNationSelect, affiliationCatalog.nations);
  removeManagerButton.hidden = !managerState;
  managerModal.hidden = false;
  requestAnimationFrame(() => document.querySelector('#manager-league-picker summary').focus());
}

function closeManagerModal() {
  managerModal.querySelectorAll('details').forEach(picker => { picker.open = false; });
  managerModal.hidden = true;
  managerSlot.focus();
}

function saveManager(event) {
  event.preventDefault();
  const league = affiliationCatalog.leagues.find(row => String(row.id) === managerLeagueSelect.value);
  const nation = affiliationCatalog.nations.find(row => String(row.id) === managerNationSelect.value);
  if (!league || !nation) {
    const picker = document.getElementById(!league ? 'manager-league-picker' : 'manager-nation-picker');
    picker.open = true;
    picker.querySelector('input').focus();
    return;
  }
  managerState = { league: league.name, nation: nation.name, leagueId: String(league.id), nationId: String(nation.id) };
  renderManagerSlot();
  closeManagerModal();
  updateSquadChemistry();
  status.textContent = 'Manager settings saved.';
}

function removeManager() {
  managerState = null;
  renderManagerSlot();
  closeManagerModal();
  updateSquadChemistry();
  status.textContent = 'Manager removed.';
}

function getManagerChemistryBonus() {
  if (!managerState) return null;
  const adapted = adaptChemistryPlayerCard({
    id: 'manager', name: managerState.name || 'Manager', nation: managerState.nation,
    league: managerState.league, club: 'Manager', position: '',
    nation_id: managerState.nationId,
    league_id: managerState.leagueId,
  });
  return { leagueId: adapted.leagueId, nationId: adapted.nationId };
}

function renderManagerSlot() {
  if (!managerState) {
    managerSlot.classList.remove('is-configured');
    managerSlot.innerHTML = '<span class="manager-empty"><b>+</b> Add Manager</span>';
    return;
  }
  managerSlot.classList.add('is-configured');
  managerSlot.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = managerState.name || 'Manager';
  const league = document.createElement('span');
  league.className = 'manager-affiliation';
  league.textContent = `◉ ${managerState.league}`;
  const nation = document.createElement('span');
  nation.className = 'manager-affiliation manager-nation';
  const nationRecord = affiliationCatalog.nations.find(row => String(row.id) === managerState.nationId);
  if (nationRecord?.flag_url?.trim()) {
    const flag = document.createElement('img');
    flag.src = nationRecord.flag_url;
    flag.alt = '';
    flag.addEventListener('error', () => flag.remove(), { once: true });
    nation.append(flag);
  }
  const nationName = document.createElement('span');
  nationName.textContent = managerState.nation;
  nation.title = managerState.nation;
  nation.append(nationName);
  managerSlot.append(title, league, nation);
}

function clearSlotDragFeedback() {
  document.querySelectorAll('.slot').forEach((slot) => {
    slot.classList.remove('is-dragging', 'is-drop-target', 'pitch-compatible');
  });
}

function handleSlotDragStart(event) {
  const slot = event.currentTarget;
  if (!hasDesktopPointer() || isSquadSlotLocked(squad[slot.dataset.position]) || event.target.closest?.('.slot-card-actions') || !slot.classList.contains('occupied') || !squad[slot.dataset.position]?.card) {
    event.preventDefault();
    return;
  }

  dragOriginPosition = slot.dataset.position;
  suppressSlotClick = true;
  slot.classList.add('is-dragging');
  document.querySelectorAll('.pitch .slot').forEach(target => target.classList.toggle('pitch-compatible', canMovePitchEntry(squad, dragOriginPosition, target.dataset.position)));
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', dragOriginPosition);
}

function handleSlotDragOver(event) {
  if (!hasDesktopPointer()) return;
  if (isSquadSlotLocked(squad[event.currentTarget.dataset.position])) { event.dataTransfer.dropEffect = 'none'; return; }
  if (exploreDragCard && event.dataTransfer.types.includes(EXPLORE_DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; return; }
  const slot = event.currentTarget;
  if (!canMovePitchEntry(squad, dragOriginPosition, slot.dataset.position)) { event.dataTransfer.dropEffect = 'none'; return; }
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

function handleSlotDragEnter(event) {
  if (!hasDesktopPointer()) return;
  const slot = event.currentTarget;
  if (canMovePitchEntry(squad, dragOriginPosition, slot.dataset.position)) {
    event.preventDefault();
    slot.classList.add('is-drop-target');
  }
}

function handleSlotDragLeave(event) {
  const slot = event.currentTarget;
  if (!slot.contains(event.relatedTarget)) slot.classList.remove('is-drop-target');
}

function handleSlotDrop(event) {
  if (!hasDesktopPointer()) return;
  if (isSquadSlotLocked(squad[event.currentTarget.dataset.position])) { event.preventDefault(); event.stopPropagation(); clearSlotDragFeedback(); return; }
  if (event.dataTransfer.types.includes(EXPLORE_DRAG_TYPE)) {
    event.preventDefault(); event.stopPropagation();
    if (exploreDragCard) applyExploreCard(exploreDragCard, event.currentTarget.dataset.position);
    endExploreDrag(); return;
  }
  event.preventDefault();
  const targetSlot = event.currentTarget;
  const originPosition = dragOriginPosition || event.dataTransfer.getData('text/plain');
  movePitchPlayer(originPosition, targetSlot);
}

function movePitchPlayer(originPosition, targetSlot) {
  const targetPosition = targetSlot.dataset.position;
  const originSlot = document.querySelector(`.slot[data-position="${originPosition}"]`);
  const originCard = squad[originPosition]?.card;
  const originState = squad[originPosition];

  if (!originSlot || !originCard || !canMovePitchEntry(squad, originPosition, targetPosition)) {
    clearSlotDragFeedback();
    return;
  }

  const targetCard = squad[targetPosition]?.card ?? null;
  const targetState = squad[targetPosition];
  placeCard(targetSlot, originCard, false, originState);
  if (targetCard) {
    placeCard(originSlot, targetCard, false, targetState);
    status.textContent = `Swapped players at ${originPosition} and ${targetPosition}.`;
  } else {
    resetSlot(originSlot, false);
    status.textContent = `Moved ${getCardName(originCard)} from ${originPosition} to ${targetPosition}.`;
  }

  clearSlotDragFeedback();
  updateSquadChemistry();
}

function handleSlotDragEnd() {
  clearSlotDragFeedback();
  dragOriginPosition = null;
  setTimeout(() => {
    suppressSlotClick = false;
  }, 0);
}

/** @returns {import('./types/chemistry').PlayerCard} */
function toChemistryPlayerCard(card) {
  return adaptChemistryPlayerCard(card);
}

function getChemistrySquad() {
  return [...document.querySelectorAll('.slot')].map((slot) => ({
    position: normalizePosition(slot.dataset.position),
    player: squad[slot.dataset.position]?.chemistryCard
      ?? (squad[slot.dataset.position]?.card ? toChemistryPlayerCard(squad[slot.dataset.position].card) : null),
  }));
}

function isCardInSlotPosition(card, slotPosition) {
  return isPositionMatched(slotPosition, toChemistryPlayerCard(card));
}

function updateSquadChemistry() {
  persistCurrentSquad();
  const chemistrySquad = getChemistrySquad();
  const result = calculateChemistry(chemistrySquad, getManagerChemistryBonus());
  totalChemistryOutput.value = String(result.totalChemistry);
  const totalCost = calculateSquadTotalCost(squad);
  totalCostOutput.value = formatBudgetNumber(totalCost);
  updateBudgetUI(totalCost);
  renderChemistryBreakdown();

  document.querySelectorAll('.slot').forEach((slot) => {
    const card = squad[slot.dataset.position]?.card;
    slot.querySelector('.pitch-chemistry-badge')?.remove();
    const positionElement = slot.querySelector('.slot-position');
    if (!card) {
      slot.classList.remove('is-out-of-position');
      return;
    }

    const chemistryCard = toChemistryPlayerCard(card);
    const chemistry = result.playerChemMap[chemistryCard.id] ?? 0;
    const positionMatches = isPositionMatched(slot.dataset.position, chemistryCard);
    slot.classList.toggle('is-out-of-position', !positionMatches);
    if (positionElement) {
      positionElement.classList.toggle('is-position-warning', !positionMatches);
      positionElement.textContent = positionMatches
        ? slot.dataset.position
        : `${slot.dataset.position} ⚠`;
    }

    slot.querySelector('.slot-card-body').append(createPitchChemistryBadge(chemistry));
  });
}

function updateTargetBudget(event) {
  targetBudget = parseBudgetInput(event.target.value);
  event.target.value = targetBudget > 0 ? formatBudgetNumber(targetBudget) : '';
  updateBudgetUI(calculateSquadTotalCost(squad));
}

function updateBudgetUI(totalCost) {
  window.dispatchEvent(new Event('auto-build-context-change'));
  totalCost = safeBudgetNumber(totalCost);
  targetBudget = safeBudgetNumber(targetBudget);
  const budget = calculateBudgetStatus(totalCost, targetBudget);
  const formatter = new Intl.NumberFormat('en-US');
  budgetProgress.className = `budget-progress is-${budget.level}`;
  budgetProgress.setAttribute('aria-valuenow', String(Math.round(budget.displayPercentage)));
  budgetProgressFill.style.width = `${budget.displayPercentage}%`;
  budgetPercentage.textContent = budget.level === 'unlimited' ? 'Unlimited' : `${budget.percentage.toFixed(1)}% Used`;
  budgetRemaining.textContent = targetBudget > 0 && budget.level !== 'over'
    ? `Remaining ${formatter.format(Math.max(0, targetBudget - totalCost))} C` : '';
  const isOverBudget = budget.level === 'over';
  totalCostSummary.classList.toggle('is-over-budget', isOverBudget);
  budgetWarning.hidden = !isOverBudget;
  budgetWarning.textContent = isOverBudget ? `⚠️ Over Budget (+${formatter.format(budget.overAmount)} C)` : '';
}

const CHEMISTRY_GROUPS = [
  { key: 'club', title: 'CLUB', label: 'CLUB', thresholds: [2, 4, 7], groupSizes: [2, 2, 3] },
  { key: 'league', title: 'LEAGUE', label: 'LEAGUE', thresholds: [3, 5, 8], groupSizes: [3, 2, 3] },
  { key: 'nation', title: 'NATION', label: 'NATION', thresholds: [2, 5, 8], groupSizes: [2, 3, 3] },
];

function renderChemistryPeopleGroups(count, groupSizes) {
  let offset = 0;
  return groupSizes.map((size, groupIndex) => {
    const icons = Array.from({ length: size }, (_, iconIndex) => {
      const isFilled = offset + iconIndex < count;
      return `<i class="${isFilled ? 'is-filled' : ''}">●</i>`;
    }).join('');
    const isComplete = count >= offset + size;
    offset += size;
    return `<span class="chemistry-people-group${isComplete ? ' is-complete' : ''}" data-stage="${groupIndex + 1}">${icons}</span>`;
  }).join('');
}

function getChemistryEntityName(card, key) {
  if (key === 'club' || key === 'league') {
    const entity = unwrapRelation(card?.[`${key}s`]) ?? unwrapRelation(card?.[key]);
    if (typeof entity?.name === 'string' && entity.name.trim()) return entity.name.trim();
  }
  const candidates = key === 'nation'
    ? ['nation', 'nationName', 'nation_name', 'nationality']
    : key === 'league'
      ? ['league', 'leagueName', 'league_name']
      : ['club', 'clubName', 'club_name', 'team'];
  const field = candidates.find((candidate) => typeof card?.[candidate] === 'string' && card[candidate].trim());
  return field ? card[field].trim() : `Unknown ${CHEMISTRY_GROUPS.find((group) => group.key === key)?.title ?? 'Affiliation'}`;
}

function getChemistryEntityKey(card, groupKey, entityId) {
  const name = getChemistryEntityName(card, groupKey);
  const isUnknown = name.startsWith('Unknown ');
  return isUnknown
    ? `${groupKey}:id:${entityId}`
    : `${groupKey}:name:${name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')}`;
}

function getChemistryEntityLogo(card, key, entityId) {
  const candidates = key === 'nation'
    ? ['nation_flag_url', 'nationFlagUrl', 'flag_url', 'flagUrl']
    : key === 'league'
      ? ['league_logo_url', 'leagueLogoUrl', 'league_image_url']
      : ['club_logo_url', 'clubLogoUrl', 'club_badge_url', 'team_logo_url'];
  const field = candidates.find((candidate) => typeof card?.[candidate] === 'string' && card[candidate].trim());
  if (field) return card[field].trim();
  if (key === 'club' || key === 'league') {
    const entities = [
      unwrapRelation(card?.[`${key}s`]), unwrapRelation(card?.[key]),
      affiliationCatalog[`${key}s`].find(entity => String(entity.id) === String(entityId)),
    ];
    const entity = entities.find(entity => typeof entity?.logo_url === 'string' && entity.logo_url.trim());
    return entity?.logo_url.trim() ?? '';
  }
  return '';
}

function getChemistryGroupRows(group) {
  const result = calculateChemistry(getChemistrySquad(), getManagerChemistryBonus());
  const cards = new Map();
  const names = new Map();
  const logos = new Map();
  [...document.querySelectorAll('.slot')].forEach((slot) => {
    const card = squad[slot.dataset.position]?.card;
    if (!card || !isCardInSlotPosition(card, slot.dataset.position)) return;
    const player = toChemistryPlayerCard(card);
    if (group.key === 'club' && (player.isIcon || player.isHero)) return;
    if (group.key === 'league' && player.isIcon) return;
    const key = String(player[group.key + 'Id']);
    const logo = getChemistryEntityLogo(card, group.key, key);
    if (logo) logos.set(key, logo);
    if (group.key !== 'club' || !cards.has(key)) {
      cards.set(key, card);
      names.set(key, getChemistryEntityName(card, group.key));
    }
  });
  const manager = getManagerChemistryBonus();
  if (manager && group.key !== 'club') {
    const key = manager[group.key + 'Id'];
    if (key) names.set(String(key), managerState[group.key]);
  }
  return Object.entries(result.groupCounts[group.key])
    .map(([id, count]) => ({
      id, count, name: names.get(id) ?? id,
      logo: logos.get(id) || getChemistryEntityLogo(cards.get(id), group.key, id),
      level: group.thresholds.filter((threshold) => count >= threshold).length,
    }))
    .sort((a, b) => b.level - a.level || b.count - a.count || a.name.localeCompare(b.name, 'ko'));
}

function renderChemistryBreakdown() {
  chemistryBreakdown.replaceChildren();
  CHEMISTRY_GROUPS.forEach((group) => {
    const section = document.createElement('section');
    section.className = 'chemistry-group';
    const heading = document.createElement('div');
    heading.className = 'chemistry-group-heading';
    heading.innerHTML = `<div><span>${group.label}</span><h3>${group.title}</h3></div><small>${group.thresholds.join(' · ')} players</small>`;
    section.append(heading);

    const rows = getChemistryGroupRows(group);
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'chemistry-empty';
      empty.textContent = 'Place players to activate chemistry points.';
      section.append(empty);
    } else {
      rows.forEach((row) => {
        const item = document.createElement('div');
        item.className = `chemistry-row${row.isIconBonus ? ' is-icon-bonus' : ''}`;
        if (row.isIconBonus) {
          item.setAttribute('aria-label', `Icons, +${row.count} chemistry contributions to all leagues`);
          item.innerHTML = `<span class="chemistry-identity"><span class="chemistry-mark is-icon">◆</span><span><span class="chemistry-row-name">Icons</span><small>ICON BONUS</small></span></span><span class="chemistry-icon-badge">All Leagues +${row.count}</span>`;
        } else {
          item.setAttribute('aria-label', `${row.name}, ${row.count} chemistry contributions, Chemistry level ${row.level}`);
          const peopleGroups = renderChemistryPeopleGroups(row.count, group.groupSizes);
          const diamonds = row.level ? '◆'.repeat(row.level) : '—';
          item.innerHTML = `<span class="chemistry-identity"><span class="chemistry-mark">${group.key === 'nation' ? '⚑' : group.key === 'league' ? '◉' : '⬢'}</span><span><span class="chemistry-row-name" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span><small>${row.count} players</small></span></span><span class="chemistry-people-groups" aria-label="${group.groupSizes.join('-')} player groups, ${Math.min(row.count, group.groupSizes.reduce((total, size) => total + size, 0))} active">${peopleGroups}</span><span class="chemistry-diamonds is-level-${row.level}" aria-label="${row.level} chemistry points">${diamonds}</span>`;
          if (row.logo) {
            const mark = item.querySelector('.chemistry-mark');
            const fallback = mark.textContent;
            const image = document.createElement('img');
            image.alt = row.name;
            image.loading = 'lazy';
            if (group.key !== 'nation') image.className = 'chemistry-entity-logo w-full h-full max-w-[26px] max-h-[26px] object-contain filter drop-shadow';
            image.addEventListener('error', () => { mark.textContent = fallback; }, { once: true });
            image.src = row.logo;
            mark.replaceChildren(image);
          }
        }
        section.append(item);
      });
    }
    chemistryBreakdown.append(section);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]);
}

function createSkillFootBadges(card, className = 'skill-foot-badges') {
  const container = document.createElement('span');
  container.className = className;

  [
    ['SM', card.sm],
    ['WF', card.wf],
  ].forEach(([label, value]) => {
    if (value === undefined || value === null || value === '') return;

    const badge = document.createElement('span');
    badge.className = 'skill-foot-badge';
    badge.textContent = `${label} ${value}★`;
    container.append(badge);
  });

  return container;
}

function createRoleBadges(card, maxCount = Infinity, className = 'role-badges') {
  const container = document.createElement('span');
  container.className = className;
  const roleBadges = (card.card_roles ?? [])
    .map((cardRole) => {
      const role = unwrapRelation(cardRole.roles);
      const name = role?.role_name;
      const level = Number(cardRole.role_level);
      if (!name) return null;

      return {
        name,
        level: [1, 2].includes(level) ? level : 1,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.level - left.level || left.name.localeCompare(right.name));

  roleBadges.slice(0, maxCount).forEach((role) => {
    const badge = document.createElement('span');
    const suffix = role.level === 2 ? '++' : role.level === 1 ? '+' : '';
    badge.className = role.level === 2
      ? 'role-badge is-plus-plus'
      : role.level === 1
        ? 'role-badge is-plus'
        : 'role-badge';
    badge.textContent = `${role.name}${suffix}`;
    container.append(badge);
  });

  if (roleBadges.length > maxCount) {
    const moreBadge = document.createElement('span');
    moreBadge.className = 'role-badge';
    moreBadge.textContent = `+${roleBadges.length - maxCount}`;
    container.append(moreBadge);
  }

  return container;
}

function createPlaystyleBadges(card, maxCount = Infinity, className = 'playstyle-badges') {
  if (className.includes('browser-player-playstyles')) {
    return createPlaystyleIcons(getPlayStyles(card), className, maxCount);
  }
  const container = document.createElement('span');
  container.className = className;
  const playstyles = getPlayStyles(card);

  playstyles.slice(0, maxCount).forEach((playstyle) => {
    const badge = document.createElement('span');
    badge.className = playstyle.isPlus ? 'playstyle-badge is-plus' : 'playstyle-badge';
    badge.textContent = `${playstyle.name}${playstyle.isPlus ? '+' : ''}`;
    container.append(badge);
  });

  if (playstyles.length > maxCount) {
    const moreBadge = document.createElement('span');
    moreBadge.className = 'playstyle-badge';
    moreBadge.textContent = `+${playstyles.length - maxCount}`;
    container.append(moreBadge);
  }

  return container;
}

function getCardName(card) {
  return card.name ?? '';
}

function getCardRating(card) {
  return card.rating ?? card.ovr ?? card.overall ?? '';
}

function getCardPosition(card) {
  const position = ['position', 'primary_position', 'position_name', 'role'].find((field) => card[field]);
  return position ? String(card[position]) : '';
}

function getCardImage(card) {
  const imageField = ['image_url', 'card_image_url', 'image', 'imageUrl', 'card_image', 'player_image_url']
    .find((field) => typeof card[field] === 'string' && card[field].trim());
  return imageField ? card[imageField] : '';
}

function formatPlayerPhysicalInfo(card) {
  const height = card.height ?? '-';
  const weight = card.weight ?? '-';
  const age = card.age ?? '-';
  const gender = card.gender ?? '-';
  const preferredFoot = card.preferred_foot ?? '-';
  const acceleType = card.accele_type ?? '-';
  const bodyType = card.body_type ?? '-';

  return `[ ${height}cm / ${weight}kg / ${age} yrs / ${gender} ] | Foot: ${preferredFoot} | Accele: ${acceleType} | Body: ${bodyType}`;
}

function getCardStats(card, includeAll = false) {
  const statFields = [
    ['PAC', ['pace', 'pac']],
    ['SHO', ['shooting', 'sho']],
    ['PAS', ['passing', 'pas']],
    ['DRI', ['dribbling', 'dri']],
    ['DEF', ['defending', 'def']],
    ['PHY', ['physical', 'phy']],
  ];

  return statFields.slice(0, includeAll ? statFields.length : 3).flatMap(([label, fields]) => {
    const field = fields.find((key) => card[key] !== undefined && card[key] !== null && card[key] !== '');
    return field ? [`${label} ${card[field]}`] : [];
  });
}

updateSquadChemistry();

excludedCardVersionsStore.subscribe(syncPitchExclusions);

const squadSlots = createSquadSlots({
  mount: document.querySelector('#squad-slots'),
  getCurrent: () => ({
    formation: currentFormation,
    players: squad,
    manager: managerState,
    totalCost: calculateSquadTotalCost(squad),
    totalChemistry: calculateChemistry(getChemistrySquad(), getManagerChemistryBonus()).totalChemistry,
  }),
  loadSquad: saved => {
    managerModal.hidden = true;
    managerState = saved.manager;
    applyFormation(FORMATIONS.find(item => item.name === saved.formation), saved.players);
    renderManagerSlot();
  },
  notify: message => { status.textContent = message; },
});
window.addEventListener('auto-build-context-change', () => squadSlots.sync());


const shareModal = createSquadShareModal({
  mount: document.querySelector('.pitch-heading'),
  getCurrent: () => {
    const formation = FORMATIONS.find(f => f.name === currentFormation);
    const entries = formation.slots.map(slot => squad[slot.position] ?? null);
    const occupied = entries.filter(entry => entry?.card);
    const manager = managerState ? {
      leagueId: managerState.leagueId != null ? String(managerState.leagueId) : managerState.league ? `league:name:${managerState.league}` : null,
      nationId: managerState.nationId != null ? String(managerState.nationId) : managerState.nation ? `nation:name:${managerState.nation}` : null,
    } : null;
    const payload = { version: 'v1', formation: currentFormation, manager, budget: targetBudget,
      slots: entries.map(entry => entry?.card ? {
        cardVersionId: String(entry.card.raw?.id ?? entry.card.id), isLocked: entry.isLocked === true, isOwned: entry.isOwned === true,
      } : null) };
    return { url: buildSquadShareUrl(window.location.href, payload), formation: currentFormation,
      count: occupied.length, chemistry: calculateChemistry(getChemistrySquad(), getManagerChemistryBonus()).totalChemistry,
      cost: calculateSquadTotalCost(squad),
      averageOvr: occupied.length ? occupied.reduce((sum, entry) => sum + (Number(getCardRating(entry.card)) || 0), 0) / occupied.length : 0 };
  },
});
window.addEventListener('auto-build-context-change', () => shareModal.sync());
function showSquadShareToast(success) {
  const toast = document.createElement('div'); toast.className = 'squad-share-toast'; toast.setAttribute('role', 'status');
  const render = () => { toast.textContent = success
    ? recommendationText('공유된 스쿼드를 불러왔습니다!', 'Shared squad loaded!')
    : recommendationText('유효하지 않은 공유 링크입니다.', 'Invalid share link.'); };
  render(); const unsubscribe = subscribeLanguage(render); document.body.append(toast);
  setTimeout(() => { unsubscribe(); toast.remove(); }, 3000);
}
async function hydrateSquadShare(shareCode = null) {
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#\??/, ''));
  if (!params.has('s') && hashParams.has('s')) params.set('s', hashParams.get('s'));
  if (shareCode === null && !params.has('s')) return false;
  const payload = decodeSquadSharePayload(shareCode ?? params.get('s'));
  if (!payload) { showSquadShareToast(false); return; }
  const workspace = document.querySelector('.squad-workspace');
  const loading = document.createElement('div'); loading.className = 'squad-share-loading'; loading.setAttribute('role', 'status');
  const spinner = document.createElement('span'); spinner.className = 'alternative-spinner';
  loading.append(spinner, document.createTextNode(recommendationText('공유 스쿼드를 불러오는 중…', 'Loading shared squad…')));
  pitchFrame.append(loading);
  workspace.setAttribute('aria-busy', 'true');
  try {
    const [players] = await Promise.all([loadSharedSquadCards(supabase, payload, normalizeBrowserPlayerCard), shareAffiliationsReady]);
    const cards = Object.values(players).map(entry => entry?.card).filter(Boolean);
    managerState = payload.manager ? autoBuildManagerState({ bestLeagueId: payload.manager.leagueId, bestNationId: payload.manager.nationId }, affiliationCatalog, cards) : null;
    targetBudget = payload.budget; targetBudgetInput.value = targetBudget ? formatBudgetNumber(targetBudget) : '';
    applyFormation(FORMATIONS.find(f => f.name === payload.formation), players);
    renderManagerSlot(); updateSquadChemistry(); showSquadShareToast(true);
    return true;
  } catch {
    if (shareCode === null) {
      managerState = null; targetBudget = 0; targetBudgetInput.value = '';
      applyFormation(FORMATIONS.find(f => f.name === '4-3-1-2'), {});
    }
    renderManagerSlot(); showSquadShareToast(false);
  } finally {
    loading.remove(); workspace.removeAttribute('aria-busy'); shareModal.sync();
  }
}
let exploreDragCard = null;
let activeSquadPanel = initialSquadPanel(window.location.search);
const exploreMount = document.createElement('aside');
const exploreBackdrop = document.createElement('div'); exploreBackdrop.className = 'explore-backdrop';
const exploreToggle = document.createElement('button'); exploreToggle.className = 'explore-edge-tab';
const buildToggle = document.createElement('button'); buildToggle.className = 'build-edge-tab';
const mobileExploreToggle = document.createElement('button'); mobileExploreToggle.className = 'explore-mobile-toggle';
for (const button of [exploreToggle, buildToggle, mobileExploreToggle]) button.type = 'button';
squadWorkspace.prepend(exploreMount, exploreBackdrop, exploreToggle);
squadWorkspace.append(buildToggle);
squadWorkspace.append(mobileExploreToggle);
function setSquadPanel(action) {
  activeSquadPanel = nextSquadPanel(activeSquadPanel, action);
  squadWorkspace.dataset.panel = activeSquadPanel;
  exploreToggle.setAttribute('aria-expanded', String(activeSquadPanel === 'explore'));
  buildToggle.setAttribute('aria-expanded', String(activeSquadPanel === 'build'));
  requestAnimationFrame(updatePitchViewport);
}
function closeExploreDrawer() {
  const wasOpen = squadWorkspace.classList.contains('explore-drawer-open');
  squadWorkspace.classList.remove('explore-drawer-open');
  mobileExploreToggle.setAttribute('aria-expanded', 'false');
  if (wasOpen) mobileExploreToggle.focus();
}
exploreToggle.onclick = () => setSquadPanel('explore');
buildToggle.onclick = () => setSquadPanel('build');
mobileExploreToggle.setAttribute('aria-controls', 'explore-panel');
mobileExploreToggle.setAttribute('aria-expanded', 'false');
mobileExploreToggle.onclick = () => {
  squadWorkspace.classList.add('explore-drawer-open');
  mobileExploreToggle.setAttribute('aria-expanded', 'true');
  exploreMount.querySelector('button')?.focus();
};
exploreBackdrop.onclick = closeExploreDrawer;
exploreMount.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeExploreDrawer();
  if (event.key === 'Tab' && squadWorkspace.classList.contains('explore-drawer-open')) {
    const buttons = [...exploreMount.querySelectorAll('button:not(:disabled)')];
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
pitchFrame.addEventListener('click', event => {
  if (window.innerWidth >= 768
    && (activeSquadPanel === 'explore' || squadWorkspace.classList.contains('explore-drawer-open'))) {
    if (!suppressSlotClick && !exploreDragCard && event.target.closest('[data-pitch-slot="true"]')) {
      closeExploreDrawer(); setSquadPanel('build');
    }
    // Leave the original click intact; desktop background/formation/manager clicks keep Presets open.
    return;
  }
  if (squadWorkspace.getAttribute('aria-busy') === 'true' || (!hasDesktopPointer() && squadWorkspace.classList.contains('explore-drawer-open'))) {
    event.preventDefault(); event.stopPropagation(); return;
  }
  const action = pitchPanelAction(event.target);
  if (action && !suppressSlotClick && !exploreDragCard) setSquadPanel(action);
}, true);
function syncExploreLabels() {
  exploreToggle.textContent = recommendationText('🔥 프리셋 · 최신', '🔥 Presets · New');
  mobileExploreToggle.textContent = recommendationText('🔥 프리셋 · 최신', '🔥 Presets · New');
  buildToggle.textContent = recommendationText('⚡ 자동 완성', '⚡ Auto Build');
  buildToggle.classList.toggle('has-players', Object.values(squad).some(entry => entry?.card));
}
subscribeLanguage(syncExploreLabels);
window.addEventListener('auto-build-context-change', syncExploreLabels);
function exploreToast(message) {
  const toast = document.createElement('div'); toast.className = 'squad-share-toast'; toast.setAttribute('role', 'status');
  toast.textContent = message; document.body.append(toast); setTimeout(() => toast.remove(), 3000);
}
async function applyExploreCard(card, position) {
  // List rows are intentionally lean. Hydrate before locking a player so the engine
  // receives the same complete card data as a modal selection or shared squad.
  if (card.summary_only && canExplorePlay(card, position)) {
    const formation = currentFormation;
    const originalTarget = squad[position];
    try {
      const detail = normalizeBrowserPlayerCard(await loadPlayerDetail(supabase, card.id));
      if (!detail || formation !== currentFormation || squad[position] !== originalTarget) throw new Error('Squad changed');
      card = detail;
    } catch {
      exploreToast(recommendationText('선수를 불러오지 못했거나 스쿼드가 변경되었습니다. 다시 시도해주세요.', 'Could not load player or squad changed. Please try again.'));
      return false;
    }
  }
  const next = placeExplorePlayer(squad, position, card);
  if (!next) {
    exploreToast(recommendationText(`${getCardName(card)} 선수는 ${formatSlotPosition(position)} 포지션으로 뛸 수 없습니다`, `${getCardName(card)} cannot play at ${formatSlotPosition(position)}`));
    return false;
  }
  for (const [key, entry] of Object.entries(squad)) {
    if (entry && !next[key]) resetSlot(document.querySelector(`.slot[data-position="${key}"]`), false);
  }
  const slot = document.querySelector(`.slot[data-position="${position}"]`);
  placeCard(slot, card, false); squad[position].isLocked = true; updateSlotLockUI(slot); updateSquadChemistry();
  return true;
}
function endExploreDrag() {
  exploreDragCard = null;
  document.querySelectorAll('.explore-compatible').forEach(slot => slot.classList.remove('explore-compatible'));
  suppressSlotClick = true; setTimeout(() => { suppressSlotClick = false; }, 0);
}
createExplorePanel({
  mount: exploreMount, name: getCardName, image: getCardImage, rating: getCardRating,
  load: async tab => (await fetchExploreCards(supabase, tab)).map(row => normalizeBrowserPlayerCard({ ...row, summary_only: Boolean(supabase) })).filter(Boolean),
  close: () => { setSquadPanel('close'); closeExploreDrawer(); },
  preset: async preset => {
    if (await hydrateSquadShare(preset.shareCode)) {
      setSquadPanel('preset'); closeExploreDrawer();
      if (preset.autoBuildOnLoad) requestAnimationFrame(() => document.querySelector('.auto-build-button')?.click());
    }
  },
  openDetail: card => {
    void playerDetail.open(card, { onAddToPitch: async selectedCard => {
      const position = findExploreSlot(squad, FORMATIONS.find(f => f.name === currentFormation).slots.map(slot => slot.position), selectedCard);
      if (!position) { exploreToast(recommendationText('뛸 수 있는 빈 슬롯이 없습니다.', 'No compatible empty slot.')); return; }
      if (await applyExploreCard(selectedCard, position)) { playerDetail.close(); closeExploreDrawer(); }
    } });
  },
  drag: card => {
    exploreDragCard = card; suppressSlotClick = true;
    document.querySelectorAll('.pitch .slot').forEach(slot => slot.classList.toggle('explore-compatible', canExplorePlay(card, slot.dataset.position)));
  },
  endDrag: endExploreDrag,
});
setSquadPanel(activeSquadPanel === 'explore' ? 'explore' : 'build'); syncExploreLabels();
function restoreFilterControls() {
  const fields = { name: playerNameSearch, minOvr: minOvrInput, maxOvr: maxOvrInput, minPrice: minPriceInput, maxPrice: maxPriceInput,
    minPlaystyles: minPlaystylesInput, maxPlaystyles: maxPlaystylesInput, minPlaystylesPlus: minPlaystylesPlusInput, maxPlaystylesPlus: maxPlaystylesPlusInput,
    minHeight: minHeightInput, maxHeight: maxHeightInput, minWeight: minWeightInput, maxWeight: maxWeightInput, minAge: minAgeInput, maxAge: maxAgeInput };
  for (const [key, input] of Object.entries(fields)) input.value = filters[key] ?? '';
  onlyPrimaryPositions.checked = filters.onlyPrimary; hasAllSelectedPositions.checked = filters.hasAllPositions;
  requireAllPlaystyles.checked = filters.requireAllPlaystyles;
  for (const key of STAT_KEYS) for (const bound of ['min', 'max']) document.getElementById(`${bound}-${key}`).value = filters.stats[key]?.[bound] ?? '';
  document.querySelectorAll('[data-position-filter], [data-rarity-filter], [data-rating-filter], [data-misc-filter]').forEach(button => {
    const d = button.dataset;
    const selected = d.positionFilter ? filters.positions.has(d.positionFilter)
      : d.rarityFilter ? filters.rarities.has(d.rarityFilter)
      : d.ratingFilter ? filters[d.ratingFilter === 'sm' ? 'minSm' : 'minWf'] === Number(d.ratingValue)
      : d.miscFilter === 'accele' ? filters.acceleTypes.has(d.miscValue)
      : d.miscFilter === 'body' ? filters.bodyTypes.has(d.miscValue)
      : filters[d.miscFilter === 'foot' ? 'preferredFoot' : 'gender'] === d.miscValue;
    button.classList.toggle('is-selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  renderAffiliationOptions(); renderRoleFilterRows(); resetDualRangeControls();
  if (tacticalPlaystylesStatus === 'ready') renderPlaystyleFilterButtons(tacticalPlaystylesList);
}

// Invoked once by the React controls' mount effect, after DOM setup is complete.
function initializeAutoResume() {
  return resumePromise ??= (async () => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#\??/, ''));
    const hasShare = query.has('s') || hash.has('s');
    try {
      if (hasShare) await hydrateSquadShare();
      else {
        const saved = readSquadState(localStorage, FORMATIONS);
        if (saved) {
          savedMinChemistry = saved.minChemistry;
          excludedCardVersionsStore.restore(saved.excludedCards);
          const advanced = saved.advancedSettings;
          const defaults = createDefaultFilters();
          for (const [key, fallback] of Object.entries(defaults)) {
            const value = advanced.filters?.[key];
            filters[key] = fallback instanceof Set ? new Set(Array.isArray(value) ? value : [])
              : Array.isArray(fallback) ? (Array.isArray(value) ? value : fallback)
              : fallback && typeof fallback === 'object' ? { ...fallback, ...(value && typeof value === 'object' ? value : {}) }
              : value ?? fallback;
          }
          for (const [key, target] of Object.entries({ tacticalSlotRoles, tacticalSlotPlaystyles, tacticalSlotStars, tacticalSlotPhysical, tacticalSlotStats })) {
            const value = advanced[key];
            if (value && typeof value === 'object' && !Array.isArray(value)) Object.assign(target, value);
          }
          managerState = saved.manager; targetBudget = saved.budget;
          targetBudgetInput.value = targetBudget ? formatBudgetNumber(targetBudget) : '';
          applyFormation(saved.formation, saved.players);
          renderManagerSlot(); restoreFilterControls();
        }
      }
    } catch { /* Missing, legacy or blocked storage must not prevent startup. */ }
    finally {
      squadHydrated = true; squadAutosave.hydrate();
      updateSquadChemistry();
    }
    return savedMinChemistry;
  })();
}
window.addEventListener('pagehide', squadAutosave.flush);
window.addEventListener('beforeunload', squadAutosave.flush);
window.addEventListener('auto-build-context-change', persistCurrentSquad);
excludedCardVersionsStore.subscribe(persistCurrentSquad);

window.matchMedia(DESKTOP_POINTER_QUERY).addEventListener('change', () => {
  clearSlotDragFeedback(); dragOriginPosition = null; suppressSlotClick = false;
  document.querySelectorAll('.pitch .slot').forEach(updateSlotLockUI);
});
