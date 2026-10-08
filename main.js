import { createPlaystylesGridSelector } from './components/PlaystylesGridSelector.js';
import { formatSlotPosition } from './utils/pitchCardLabels.js';
import { createPlayerCard } from './components/PlayerCard.js';
import { handlePitchSlotClick } from './utils/pitchSlotInteraction.js';
import { createCardReviewButtons } from './components/CardReviewButton.js';
import { createPitchExcludeButton, syncPitchExclusions } from './components/PitchExcludeButton.js';
import { excludedCardVersionsStore } from './utils/excludedCardVersions.js';
import { createPitchChemistryBadge } from './components/PitchChemistryBadge.js';
import { createPitchMiniCard } from './components/PitchMiniCard.js';
import { createSquadSlots } from './components/SquadSlots.js';
import { getCardBackground } from './utils/cardBackground.js';
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
import { clearUnlockedSquadEntries, createSquadEntry, isSquadSlotLocked, toggleSquadSlotLock } from './utils/squadLock.ts';
import { FORMATIONS, reassignFormation } from './utils/formations.js';
import { fitPitchViewport, fitSquadWorkspace } from './utils/pitchViewport.js';
import { calculateSquadTotalCost, getCardCoinPrice } from './utils/squadCost.ts';
import { calculateBudgetStatus } from './utils/budget.ts';
import { mountAutoBuildSettings } from './components/AutoBuildSettings.jsx';
import { autoBuildManagerState } from './utils/autoBuildUi.js';

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
const modalPositionButtons = [...document.querySelectorAll('[data-position-mode]')];
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
let targetBudget = 0;
let modalPlayerCards = [];
let dragOriginPosition = null;
let suppressSlotClick = false;
const squad = {};
let affiliationCatalog = { nations: [], leagues: [], clubs: [] };
let modalRequest = 0;
let modalSelectionRequest = 0;
let modalSearchTimer;
let modalAbort;
const modalPager = createPlayerPagination(MODAL_PAGE_SIZE);
const modalLoadMore = document.querySelector('#modal-load-more');
modalLoadMore.addEventListener('click', () => loadModalPlayerPage());

function bindSquadSlot(slot) {
  slot.addEventListener('click', event => {
    const entry = squad[slot.dataset.position];
    handlePitchSlotClick(event, {
      entry, suppressed: suppressSlotClick, locked: isSquadSlotLocked(entry), open: openPlayerModal,
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

const formationPicker = document.querySelector('#formation-picker');
const formationMenu = document.querySelector('#formation-menu');
let currentFormation = '4-3-3';
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
function updatePitchViewport() {
  if (window.matchMedia('(min-width: 1024px)').matches && squadWorkspace.clientHeight) {
    const heading = document.querySelector('.pitch-heading');
    const layout = fitSquadWorkspace(squadWorkspace.clientWidth, squadWorkspace.clientHeight,
      document.querySelector('.chemistry-panel').offsetWidth,
      Number.parseFloat(getComputedStyle(squadWorkspace).columnGap),
      heading.offsetHeight + 8,
      Number.parseFloat(getComputedStyle(squadWorkspace).getPropertyValue('--max-pitch-height')) || 840);
    squadWorkspace.style.setProperty('--viewport-pitch-width', `${layout.pitchWidth}px`);
    squadWorkspace.style.setProperty('--viewport-pitch-height', `${layout.pitchHeight}px`);
    squadWorkspace.style.setProperty('--pitch-header-height', `${layout.headerHeight}px`);
  }
  const pitch = pitchFrame.querySelector('.pitch');
  const height = Number.parseFloat(pitch.style.getPropertyValue('--formation-height'));
  const availableWidth = pitchFrame.clientWidth;
  if (!availableWidth || !pitchFrame.clientHeight) return;
  const fit = fitPitchViewport(availableWidth, pitchFrame.clientHeight, height);
  pitch.style.setProperty('--pitch-width', `${fit.scale > 0 ? availableWidth / fit.scale : fit.width}px`);
  pitch.style.setProperty('--pitch-scale', fit.scale);
  squadWorkspace.style.setProperty('--fitted-pitch-width', `${Math.min(availableWidth, fit.width * fit.scale)}px`);
  squadWorkspace.style.setProperty('--fitted-pitch-height', `${Math.min(pitchFrame.clientHeight, fit.fittedHeight)}px`);
  pitchFrame.style.setProperty('--scroll-pitch-width', `${fit.width * fit.scale}px`);
  pitchFrame.style.setProperty('--scroll-pitch-height', `${fit.fittedHeight}px`);
}
const pitchResizeObserver = new ResizeObserver(updatePitchViewport);
pitchResizeObserver.observe(squadWorkspace);
pitchResizeObserver.observe(pitchFrame);
pitchResizeObserver.observe(document.querySelector('.pitch-heading'));
updatePitchViewport();
let tacticalRolesDialog = null;
let selectedSlotPos = 'ST';
const tacticalSlotRoles = {};
const tacticalSlotPlaystyles = {};
let tacticalPlaystylesList = [];
let tacticalPlaystylesStatus = 'loading';
let tacticalTab = 'roles';
const updateAutoBuildFormation = mountAutoBuildSettings(
  document.querySelector('#auto-build-settings'), currentFormation, () => targetBudget,
  { budgetSection: document.querySelector('.budget-summary'), supabase, getSquadSnapshot, applyAutoBuildResult, getCurrentSquad: () => structuredClone(squad), resetTargetBudget, openTacticalRoles, getRoleOptions },
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
  if ((!result.success && result.status !== 'fallback') || result.squad.length !== 11 || new Set(result.squad.map(p => p.slotPosition)).size !== 11) {
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
    return { slot, card, isOwned: player.isOwned === true, isLocked: previous?.isLocked === true };
  });
  const nextManager = autoBuildManagerState(result.manager, affiliationCatalog, placements.map(item => item.card));
  closeModal();
  managerModal.hidden = true;
  dragOriginPosition = null;
  clearSlotDragFeedback();
  Object.keys(squad).forEach(key => delete squad[key]);
  placements.forEach(({ slot, card, isOwned, isLocked }) => {
    placeCard(slot, card, false, { isOwned });
    squad[slot.dataset.position].isLocked = isLocked;
    updateSlotLockUI(slot);
  });
  managerState = nextManager;
  renderManagerSlot();
  updateSquadChemistry();
  status.textContent = result.status === 'fallback' ? 'Added 11 budget players. Review the total cost and chemistry.' : 'Applied the auto-built squad of 11 players and manager settings.';
}
function applyFormation(formation, savedPlayers = null) {
  closeModal();
  const nextSquad = savedPlayers ?? reassignFormation(squad, formation.slots);
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
      squad[position].isLocked = entry.isLocked;
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

clearSquadButton.addEventListener('click', clearUnlockedPlayers);
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

modalPositionButtons.forEach(button => button.addEventListener('click', () => {
  if (modalPositionMode === button.dataset.positionMode) return;
  setModalPositionMode(button.dataset.positionMode);
  resetModalSearch();
  loadModalPlayerPage();
}));

function setModalPositionMode(mode) {
  modalPositionMode = mode;
  modalPositionButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.positionMode === mode)));
}

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
void loadAffiliationFilterOptions();

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

function schedulePlayerSearch() {
  window.clearTimeout(playerSearchTimer);
  ++playerSearchRequest;
  playerSearchAbort?.abort();
  playersPager.reset();
  playerLoadMore.disabled = true;
  playerLoadMore.hidden = true;
  playerPaginationStatus.textContent = '';
  playerGrid.replaceChildren();
  resetPlayerResultsScroll();
  playerGrid.setAttribute('aria-busy', 'true');
  setPlayerGridLoading();
  playerSearchTimer = window.setTimeout(searchPlayers, 200);
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
    positions: { icon: '⚽', label: 'Position / Roles' },
    ovr: { icon: '📊', label: 'OVR / Price' },
    'sm-wf': { icon: '★', label: 'SM / WF' },
    playstyles: { icon: '✨', label: 'PlayStyles' },
    affiliation: { icon: '🌐', label: 'Affiliations' },
    rarity: { icon: '🃏', label: 'Card Rarity' },
    stats: { icon: '📈', label: 'Detailed Stats' },
    miscellaneous: { icon: '⚙️', label: 'Physical & Body' },
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
    const label = document.createElement('span');
    label.className = 'command-label';
    label.textContent = command.label;
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
    content.setAttribute('aria-label', `${command.label} filters`);
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
  updateCommandSummaries();
}

function toggleCommandPopover(section) {
  const accordion = document.querySelector(`[data-filter-section="${section}"]`);
  const shouldOpen = !accordion.classList.contains('is-command-open');
  closeCommandPopovers();
  accordion.classList.toggle('is-command-open', shouldOpen);
  accordion.querySelector('[data-filter-accordion]').setAttribute('aria-expanded', String(shouldOpen));
}

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
}

function resetPlayerResultsScroll() {
  for (const selector of ['.players-results', '.players-layout']) {
    const panel = document.querySelector(selector);
    if (panel) panel.scrollTop = 0;
  }
}

async function searchPlayers(scrollPositions = capturePlayerPanelScrollPositions(), append = false) {
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
  updateCommandSummaries();
  playerLoadMore.hidden = false;
  playerLoadMore.disabled = true;
  playerLoadMore.textContent = 'Loading players...';
  playerGrid.setAttribute('aria-busy', 'true');
  if (!append || !playersPager.state.cards.length) {
    playerGrid.replaceChildren();
    playerPaginationStatus.textContent = '';
    setPlayerGridLoading();
  }
  try {
    const { rows, total } = await fetchPlayersPage(supabase, filters, { offset: ticket.offset, signal });
    if (requestId !== playerSearchRequest) return;
    const cards = rows.map(normalizeBrowserPlayerCard).filter(Boolean);
    const previousCount = playersPager.state.cards.length;
    if (!playersPager.complete(ticket, rows, cards, total)) return;
    if (append && previousCount) {
      for (const card of playersPager.state.cards.slice(previousCount)) {
        playerGrid.append(buildPlayerCard(card, { onActivate: playerDetail.open }));
      }
    } else renderPlayerGrid(playersPager.state.cards, scrollPositions);
    const loaded = playersPager.state.cards.length.toLocaleString('en-US');
    const matching = total.toLocaleString('en-US');
    playerResultCount.textContent = `Showing ${loaded} of ${matching}`;
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
  filters.club = clubFilter.value;
}

async function loadAffiliationFilterOptions() {
  try {
    affiliationCatalog = await fetchAffiliations(supabase);
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

function getRoleOptions() {
  const slots = FORMATIONS.find(item => item.name === currentFormation).slots;
  const slotRequirements = {};
  for (const slot of slots) {
    const roles = Object.hasOwn(tacticalSlotRoles, slot.position) ? tacticalSlotRoles[slot.position] ?? []
      : filters.selectedRoles.filter(role => role.position === normalizeChemistryPosition(slot.position))
        .map(role => ({ name: role.name, minLevel: role.level }));
    const playstyles = tacticalSlotPlaystyles[slot.position];
    if (roles.length || playstyles?.length) slotRequirements[slot.position] = {
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
    node.setAttribute('aria-label', slot.position + (requirements[slot.position] ? ' role configured' : ' select role'));
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
  dialog.innerHTML = '<header><h2 id="tactical-roles-title">Tactical Roles / Playstyles</h2><button type="button" aria-label="Close Tactical Roles">×</button></header>';
  const map = document.createElement('div');
  map.innerHTML = '<p class="tactical-formation-name"></p><div class="tactical-mini-pitch" aria-label="Formation slots"></div>';
  const tabs = document.createElement('div');
  tabs.className = 'tactical-tabs';
  for (const [tab, label] of [['roles', '🎭 Roles'], ['playstyles', '⚡ Playstyles']]) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.tab = tab; button.textContent = label;
    button.addEventListener('click', () => { tacticalTab = tab; renderRoleFilterRows(); });
    tabs.append(button);
  }
  const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'tactical-clear-all'; reset.textContent = 'Clear All';
  reset.addEventListener('click', () => {
    filters.selectedRoles = [];
    for (const key of Object.keys(tacticalSlotRoles)) delete tacticalSlotRoles[key];
    for (const key of Object.keys(tacticalSlotPlaystyles)) delete tacticalSlotPlaystyles[key];
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
function renderRoleFilterRows() {
  roleFilterList.replaceChildren();
  if (tacticalRolesDialog) {
    tacticalRolesDialog.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tab === tacticalTab)));
  }
  renderTacticalPitch();
  window.dispatchEvent(new Event('auto-build-context-change'));
  const selectedPositions = tacticalRolesDialog ? [normalizeChemistryPosition(selectedSlotPos)] : [...filters.positions];
  const subfilter = roleFilterList.closest('.position-role-subfilter');
  if (subfilter) subfilter.hidden = selectedPositions.length === 0;

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = 'role-all-chip';
  allChip.classList.toggle('is-selected', filters.selectedRoles.length === 0);
  allChip.setAttribute('aria-pressed', String(filters.selectedRoles.length === 0));
  allChip.textContent = tacticalRolesDialog ? 'Clear slot role' : 'All / Any';
  allChip.addEventListener('click', () => {
    if (tacticalRolesDialog) {
      if (tacticalTab === 'playstyles') delete tacticalSlotPlaystyles[selectedSlotPos];
      else tacticalSlotRoles[selectedSlotPos] = null;
    } else {
      filters.selectedRoles = [];
      for (const key of Object.keys(tacticalSlotRoles)) delete tacticalSlotRoles[key];
    }
    renderRoleFilterRows();
    searchPlayers();
  });
  roleFilterList.append(allChip);

  if (tacticalRolesDialog && tacticalTab === 'playstyles') {
    allChip.textContent = 'Clear slot Playstyle';
    if (tacticalPlaystylesStatus !== 'ready') {
      const status = document.createElement('p');
      status.textContent = tacticalPlaystylesStatus === 'loading' ? 'Loading Playstyles…' : 'Playstyles를 불러오지 못했습니다.';
      roleFilterList.append(status);
      if (tacticalPlaystylesStatus === 'error') {
        const retry = document.createElement('button');
        retry.type = 'button'; retry.textContent = '다시 시도';
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

async function openPlayerModal(slot) {
  if (isSquadSlotLocked(squad[slot.dataset.position])) return;
  activeSlot = slot;
  modalPlayerCards = [];
  modalPlayerSearchInput.value = '';
  modalPlayerSearchClear.hidden = true;
  setModalPositionMode('all');
  const position = slot.dataset.position;
  modal.hidden = false;
  requestAnimationFrame(() => modalPlayerSearchInput.focus());
  modalTitle.textContent = `Select ${formatSlotPosition(position)}`;
  modalDescription.textContent = `Loading ${position} players…`;
  renderMessage('Loading players…');

  resetModalSearch();
  await loadModalPlayerPage();
}

function resetModalSearch() {
  clearTimeout(modalSearchTimer);
  modalAbort?.abort();
  modalRequest += 1;
  modalPager.reset();
  modalPlayerCards = [];
  modalLoadMore.hidden = true;
  renderMessage('Loading players…');
}

async function loadModalPlayerPage() {
  if (modal.hidden || !activeSlot) return;
  const ticket = modalPager.begin();
  if (!ticket) return;
  const requestId = modalRequest;
  const position = activeSlot.dataset.position;
  modalAbort = new AbortController();
  modalLoadMore.disabled = true;
  modalLoadMore.textContent = 'Loading…';
  try {
    const rows = await fetchModalPlayerPage(supabase, {
      position: normalizePosition(position), keyword: modalPlayerSearchInput.value,
      positionMode: modalPositionMode,
      offset: ticket.offset, signal: modalAbort.signal,
    });
    if (requestId !== modalRequest || modal.hidden) return;
    const selectedCardIds = getSelectedCardIds(position);
    const cards = rows.map(normalizeBrowserPlayerCard).filter(Boolean)
      .filter(card => !selectedCardIds.has(String(card.id)));
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
      modalLoadMore.textContent = 'Load More (30 Players)';
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
    version: cardVersion.version,
    card_type: cardVersion.card_type,
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

function normalizePlaystyles(...records) {
  const normalized = new Map();

  const addSource = (source, forcedPlus = null) => {
    const parsed = parsePlaystyleSource(source);
    asArray(parsed).forEach((entry) => {
      const safeEntry = parsePlaystyleSource(entry);
      if (Array.isArray(safeEntry)) {
        safeEntry.forEach((item) => addSource(item, forcedPlus));
        return;
      }

      if (typeof safeEntry === 'string') {
        const name = safeEntry.trim();
        const key = `${name.toLowerCase()}|${Boolean(forcedPlus)}`;
        if (name && !normalized.has(key)) normalized.set(key, { name, isPlus: Boolean(forcedPlus) });
        return;
      }
      if (!safeEntry || typeof safeEntry !== 'object') return;

      const relation = unwrapRelation(
        safeEntry.playstyles ?? safeEntry.playStyles ?? safeEntry.play_styles ?? safeEntry.playstyle ?? safeEntry.trait,
      );
      const sourceObject = relation && typeof relation === 'object' ? relation : safeEntry;
      const name = sourceObject.name ?? sourceObject.playstyle_name ?? sourceObject.playStyleName
        ?? sourceObject.trait_name ?? sourceObject.label;
      if (typeof name !== 'string' || !name.trim()) return;

      const rawLevel = safeEntry.level ?? sourceObject.level;
      const levelIsPlus = (typeof rawLevel === 'string' && rawLevel.toLowerCase().includes('plus'))
        || (Number.isFinite(Number(rawLevel)) && Number(rawLevel) > 0);
      const isPlus = forcedPlus ?? Boolean(
        safeEntry.is_plus ?? safeEntry.isPlus ?? safeEntry.plus
        ?? sourceObject.is_plus ?? sourceObject.isPlus ?? sourceObject.plus
        ?? levelIsPlus,
      );
      const cleanName = name.trim().replace(/\+$/, '').trim();
      const plusFromName = /\+$/.test(name.trim());
      const key = `${cleanName.toLowerCase()}|${isPlus || plusFromName}`;
      const previous = normalized.get(key);
      normalized.set(key, {
        name: cleanName,
        isPlus: isPlus || plusFromName,
        image_url: sourceObject.image_url || previous?.image_url,
        image_url_plus: sourceObject.image_url_plus || previous?.image_url_plus,
      });
    });
  };

  records.filter((record) => record && typeof record === 'object').forEach((record) => {
    [record.card_playstyles, record.playstyles, record.playStyles, record.play_styles, record.traits, record.playstyle_ids]
      .forEach((source) => addSource(source));
    [record.normalPlayStyles, record.normal_playstyles, record.normal_play_styles]
      .forEach((source) => addSource(source, false));
    [record.playStylePlus, record.playStylesPlus, record.play_style_plus, record.play_styles_plus, record.traitsPlus]
      .forEach((source) => addSource(source, true));
  });

  return [...normalized.values()].sort((left, right) => Number(right.isPlus) - Number(left.isPlus) || left.name.localeCompare(right.name));
}

function getPlayStyles(player) {
  const raw = player?.raw;
  const nestedPlayer = unwrapRelation(raw?.players);
  return normalizePlaystyles(player, raw, nestedPlayer);
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
  modalSearchTimer = setTimeout(() => loadModalPlayerPage(), 200);
}

function buildPlayerCard(card, options) {
  return createPlayerCard(card, {
    getCardName, getCardRating, getCardPosition, getChemistryEntityLogo,
    createPlaystyleBadges, unwrapRelation, affiliationCatalog, createReviewButton, onShowDetails: playerDetail.open, ...options,
  });
}

function renderFilteredPlayerList() {
  playerList.replaceChildren();
  modalPlayerCards.forEach(card => {
    const article = buildPlayerCard(card, {
      actionLabel: 'Select Player',
      textAffiliations: false,
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
          status.textContent = `Added ${getCardName(detail)} at ${slot.dataset.position}.`;
          closeModal();
        } catch (error) {
          if (selectionId === modalSelectionRequest && requestId === modalRequest) modalDescription.textContent = `Unable to load player details. Please select the player again. (${error.message})`;
        } finally {
          article.removeAttribute('aria-busy');
        }
      },
    });
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
  if (isSquadSlotLocked(squad[slotKey])) return;
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

function placeCard(slot, card, shouldUpdate = true, state = {}) {
  const name = getCardName(card);
  const chemistryCard = toChemistryPlayerCard(card);
  slot.dataset.card = name;
  slot.dataset.cardId = chemistryCard.id;
  squad[slot.dataset.position] = createSquadEntry(chemistryCard.id, card, chemistryCard);
  squad[slot.dataset.position].isOwned = state.isOwned === true;
  slot.draggable = true;
  slot.classList.add('occupied');
  const backgroundUrl = getCardBackground(card);
  slot.style.removeProperty('background-image');
  slot.classList.remove('is-locked');
  slot.replaceChildren();
  const body = document.createElement('span');
  body.className = 'slot-card-body';
  body.style.backgroundImage = backgroundUrl
    ? `linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.35)), url(${JSON.stringify(backgroundUrl)})` : 'none';
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

  const removeButton = document.createElement('button');
  removeButton.className = 'remove-player';
  removeButton.type = 'button';
  removeButton.setAttribute('aria-label', `Remove ${name}`);
  removeButton.textContent = '×';
  removeButton.addEventListener('click', (event) => handleRemovePlayer(event, slot.dataset.position));
  const detailButton = document.createElement('button');
  detailButton.className = 'detail-player';
  detailButton.type = 'button';
  detailButton.setAttribute('aria-label', 'View details for ' + name);
  detailButton.title = 'View details';
  detailButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg>';
  detailButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const selectedCard = squad[slot.dataset.position]?.card;
    if (selectedCard) playerDetail.open(selectedCard);
  });
  cardActions.append(lockButton, ownedButton, createPitchExcludeButton(card), detailButton, removeButton);
  top.append(cardActions);
  syncPitchExclusions();
  updateSlotLockUI(slot);
  updateSlotOwnedUI(slot);

  body.append(createPitchMiniCard(card, getPlayStyles(card), affiliationCatalog, { createReviewButton }));
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
  window.dispatchEvent(new Event('auto-build-context-change'));
  updateSlotLockUI(slot);
  status.textContent = `${getCardName(entry.card)} ${isLocked ? 'locked.' : 'unlocked.'}`;
}

function updateSlotLockUI(slot) {
  const entry = squad[slot.dataset.position];
  const isLocked = isSquadSlotLocked(entry);
  const lockButton = slot.querySelector('.lock-player');
  const removeButton = slot.querySelector('.remove-player');

  slot.classList.toggle('is-locked', isLocked);
  slot.draggable = Boolean(entry?.card) && !isLocked;
  if (lockButton) {
    lockButton.textContent = isLocked ? '🔒' : '🔓';
    lockButton.dataset.tooltip = isLocked ? 'Unlock' : 'Lock';
    lockButton.setAttribute('aria-label', `${isLocked ? 'Unlock' : 'Lock'} ${getCardName(entry.card)}`);
    lockButton.setAttribute('aria-pressed', String(isLocked));
  }
  if (removeButton) removeButton.hidden = isLocked;
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
    ownedButton.dataset.tooltip = isOwned ? 'Owned (0 C Cost)' : 'Not Owned (Cost Included)';
    ownedButton.setAttribute('aria-label', `Mark ${getCardName(entry.card)} as ${isOwned ? 'not owned' : 'owned'}`);
    ownedButton.setAttribute('aria-pressed', String(isOwned));
  }
  if (priceBadge) {
    priceBadge.replaceChildren();
    if (isOwned) {
      const originalPrice = document.createElement('s');
      originalPrice.textContent = formattedPrice;
      priceBadge.append(originalPrice, document.createTextNode(' → 0 C'));
    } else {
      priceBadge.textContent = `${formattedPrice} C`;
    }
  }
}

function clearUnlockedPlayers() {
  const hadManager = Boolean(managerState);
  const clearedSlots = clearUnlockedSquadEntries(squad);
  clearedSlots.forEach((slotKey) => {
    const slot = document.querySelector(`.slot[data-position="${slotKey}"]`);
    if (slot) resetSlot(slot, false);
  });
  managerState = null;
  renderManagerSlot();
  status.textContent = clearedSlots.length || hadManager
    ? `Cleared ${clearedSlots.length} unlocked players and manager settings.`
    : 'No unlocked players to clear.';
  updateSquadChemistry();
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
    slot.classList.remove('is-dragging', 'is-drop-target');
  });
}

function handleSlotDragStart(event) {
  const slot = event.currentTarget;
  if (!slot.classList.contains('occupied') || !squad[slot.dataset.position]?.card
    || isSquadSlotLocked(squad[slot.dataset.position])) {
    event.preventDefault();
    return;
  }

  dragOriginPosition = slot.dataset.position;
  suppressSlotClick = true;
  slot.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', dragOriginPosition);
}

function handleSlotDragOver(event) {
  const slot = event.currentTarget;
  if (!dragOriginPosition || isSquadSlotLocked(squad[slot.dataset.position])) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

function handleSlotDragEnter(event) {
  const slot = event.currentTarget;
  if (dragOriginPosition && slot.dataset.position !== dragOriginPosition
    && !isSquadSlotLocked(squad[slot.dataset.position])) {
    event.preventDefault();
    slot.classList.add('is-drop-target');
  }
}

function handleSlotDragLeave(event) {
  const slot = event.currentTarget;
  if (!slot.contains(event.relatedTarget)) slot.classList.remove('is-drop-target');
}

function handleSlotDrop(event) {
  event.preventDefault();
  const targetSlot = event.currentTarget;
  const originPosition = dragOriginPosition || event.dataTransfer.getData('text/plain');
  const targetPosition = targetSlot.dataset.position;
  const originSlot = document.querySelector(`.slot[data-position="${originPosition}"]`);
  const originCard = squad[originPosition]?.card;
  const originOwned = squad[originPosition]?.isOwned === true;

  if (!originSlot || !originCard || originPosition === targetPosition
    || isSquadSlotLocked(squad[originPosition]) || isSquadSlotLocked(squad[targetPosition])) {
    clearSlotDragFeedback();
    return;
  }

  const targetCard = squad[targetPosition]?.card ?? null;
  const targetOwned = squad[targetPosition]?.isOwned === true;
  placeCard(targetSlot, originCard, false, { isOwned: originOwned });
  if (targetCard) {
    placeCard(originSlot, targetCard, false, { isOwned: targetOwned });
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
  const chemistrySquad = getChemistrySquad();
  const result = calculateChemistry(chemistrySquad, getManagerChemistryBonus());
  totalChemistryOutput.value = String(result.totalChemistry);
  const totalCost = calculateSquadTotalCost(squad);
  totalCostOutput.value = new Intl.NumberFormat('en-US').format(totalCost);
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
  const digits = event.target.value.replace(/\D/g, '');
  targetBudget = Number(digits) || 0;
  event.target.value = targetBudget > 0 ? new Intl.NumberFormat('en-US').format(targetBudget) : '';
  updateBudgetUI(calculateSquadTotalCost(squad));
}

function updateBudgetUI(totalCost) {
  window.dispatchEvent(new Event('auto-build-context-change'));
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

function getChemistryEntityLogo(card, key) {
  const candidates = key === 'nation'
    ? ['nation_flag_url', 'nationFlagUrl', 'flag_url', 'flagUrl']
    : key === 'league'
      ? ['league_logo_url', 'leagueLogoUrl', 'league_image_url']
      : ['club_logo_url', 'clubLogoUrl', 'club_badge_url', 'team_logo_url'];
  const field = candidates.find((candidate) => typeof card?.[candidate] === 'string' && card[candidate].trim());
  return field ? card[field].trim() : '';
}

function getChemistryGroupRows(group) {
  const result = calculateChemistry(getChemistrySquad(), getManagerChemistryBonus());
  const cards = new Map();
  const names = new Map();
  [...document.querySelectorAll('.slot')].forEach((slot) => {
    const card = squad[slot.dataset.position]?.card;
    if (!card || !isCardInSlotPosition(card, slot.dataset.position)) return;
    const player = toChemistryPlayerCard(card);
    if (group.key === 'club' && (player.isIcon || player.isHero)) return;
    if (group.key === 'league' && player.isIcon) return;
    const key = String(player[group.key + 'Id']);
    cards.set(key, card);
    names.set(key, getChemistryEntityName(card, group.key));
  });
  const manager = getManagerChemistryBonus();
  if (manager && group.key !== 'club') {
    const key = manager[group.key + 'Id'];
    if (key) names.set(String(key), managerState[group.key]);
  }
  return Object.entries(result.groupCounts[group.key])
    .map(([id, count]) => ({
      id, count, name: names.get(id) ?? id,
      logo: getChemistryEntityLogo(cards.get(id), group.key),
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
            const image = document.createElement('img');
            image.src = row.logo;
            image.alt = '';
            image.addEventListener('error', () => image.remove());
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
    return createPlaystyleIcons(getPlayStyles(card), className);
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
