import { createPlayerCard } from './components/PlayerCard.js';
import { getCardBackground } from './utils/cardBackground.js';
import { fetchModalPlayerPage, MODAL_PAGE_SIZE } from './utils/modalPlayers.js';
import { createPlayerPagination } from './utils/playerPagination.js';
import { createPlayerDetailModal } from './components/PlayerDetailModal.js';
import { STAT_KEYS, defaultStats, activeStats, renderStatInputs } from './utils/statFilters.js';
import { fetchAffiliations, clubsForLeague, renderSearchableSelect } from './utils/affiliations.js';
import { fetchPlaystyleOptions } from './utils/playstyleFilters.js';
import { PLAYER_CARD_SELECT } from './utils/playerCards.js';
import { createDefaultFilters, fetchPlayers } from './utils/playerFilters.js';
import { scoreSearchResults, scoreModalPlayers, getValueScoreGrade } from './utils/playerSearch.js';
import { createClient } from '@supabase/supabase-js';
import { adaptChemistryPlayerCard, calculateChemistry, isPositionMatched, normalizeChemistryPosition } from './utils/chemistry.ts';
import { clearUnlockedSquadEntries, createSquadEntry, isSquadSlotLocked, toggleSquadSlotLock } from './utils/squadLock.ts';
import { FORMATIONS, reassignFormation } from './utils/formations.js';
import { fitPitchViewport } from './utils/pitchViewport.js';
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
playerLoadMore.addEventListener('click', () => searchPlayers());
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
const hasAllSelectedRoles = document.querySelector('#has-all-selected-roles');
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
let modalSearchTimer;
let modalAbort;
const modalPager = createPlayerPagination(MODAL_PAGE_SIZE);
const modalLoadMore = document.querySelector('#modal-load-more');
modalLoadMore.addEventListener('click', () => loadModalPlayerPage());

function bindSquadSlot(slot) {
  slot.addEventListener('click', () => {
    if (!suppressSlotClick && !isSquadSlotLocked(squad[slot.dataset.position])) openPlayerModal(slot);
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
});
const pitchFrame = document.querySelector('.pitch-scroll');
const squadWorkspace = document.querySelector('.squad-workspace');
function updatePitchViewport() {
  const pitch = pitchFrame.querySelector('.pitch');
  const height = Number.parseFloat(pitch.style.getPropertyValue('--formation-height'));
  if (!squadWorkspace.clientWidth || !pitchFrame.clientHeight) return;
  const stacked = window.matchMedia('(max-width: 640px)').matches;
  const panelWidth = document.querySelector('.chemistry-panel').offsetWidth;
  const gap = Number.parseFloat(getComputedStyle(squadWorkspace).columnGap);
  const availableWidth = stacked ? squadWorkspace.clientWidth : squadWorkspace.clientWidth - panelWidth - gap;
  const fit = fitPitchViewport(availableWidth, pitchFrame.clientHeight, height);
  pitch.style.setProperty('--pitch-width', `${fit.width}px`);
  pitch.style.setProperty('--pitch-scale', fit.scale);
  squadWorkspace.style.setProperty('--fitted-pitch-width', `${fit.width * fit.scale}px`);
  squadWorkspace.style.setProperty('--fitted-pitch-height', `${fit.fittedHeight}px`);
}
const pitchResizeObserver = new ResizeObserver(updatePitchViewport);
pitchResizeObserver.observe(squadWorkspace);
updatePitchViewport();
const updateAutoBuildFormation = mountAutoBuildSettings(
  document.querySelector('#auto-build-settings'), currentFormation, () => targetBudget,
  { budgetSection: document.querySelector('.budget-summary'), supabase, getSquadSnapshot, applyAutoBuildResult, getCurrentSquad: () => structuredClone(squad), resetTargetBudget },
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
    throw new Error('구성 중 포메이션, 예산 또는 스쿼드가 변경되었습니다. 현재 설정으로 다시 실행해 주세요.');
  }
  const slots = [...document.querySelectorAll('.pitch .slot')];
  // Validate and normalize every entry before changing the current squad.
  if ((!result.success && result.status !== 'fallback') || result.squad.length !== 11 || new Set(result.squad.map(p => p.slotPosition)).size !== 11) {
    throw new Error('완성된 11명 스쿼드를 확인할 수 없습니다. 다시 시도해 주세요.');
  }
  const placements = result.squad.map(player => {
    const slot = slots.find(item => item.dataset.position === player.slotPosition);
    const previous = squad[player.slotPosition];
    if (previous?.isLocked && String(previous.card_id) !== String(player.id)) {
      throw new Error('잠긴 선수는 교체할 수 없습니다. 다시 실행해 주세요.');
    }
    const retained = Object.values(squad).find(entry => entry && String(entry.card_id) === String(player.id));
    const card = retained?.card ?? normalizeBrowserPlayerCard(player.card);
    if (!slot || !card || (!previous?.isLocked && !isCardInSlotPosition(card, player.slotPosition))) {
      throw new Error('선수의 포지션 정보를 확인할 수 없습니다. 다시 시도해 주세요.');
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
  status.textContent = result.status === 'fallback' ? '저가 선수 11명으로 채웠습니다. 총비용과 케미스트리를 확인해 주세요.' : '자동 완성된 선수 11명과 감독 설정을 적용했습니다.';
}
function applyFormation(formation) {
  closeModal();
  const nextSquad = reassignFormation(squad, formation.slots);
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
    slot.setAttribute('aria-label', `${position} 선수 선택`);
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
  document.querySelector('#squad-builder-page h1').textContent = `${currentFormation} 스쿼드`;
  pitch.setAttribute('aria-label', `${currentFormation} 포메이션`);
  formationMenu.querySelectorAll('button').forEach(button =>
    button.setAttribute('aria-pressed', String(button.textContent === currentFormation)));
  formationPicker.open = false;
  dragOriginPosition = null;
  updateSquadChemistry();
  status.textContent = `${currentFormation} 포메이션으로 변경했습니다. 선수의 새 포지션과 케미스트리를 확인하세요.`;
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
      document.querySelector('#stats-validation').textContent = key + ': Min은 Max보다 클 수 없습니다.';
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

hasAllSelectedRoles.addEventListener('change', () => {
  void handleHasAllRolesChange();
});

hasAllSelectedRoles.addEventListener('pointerdown', () => {
  pendingPanelScrollPositions = capturePlayerPanelScrollPositions();
});

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
  playerLoadMore.disabled = true;
  playerGrid.setAttribute('aria-busy', 'true');
  setPlayerGridLoading();
  playerSearchTimer = window.setTimeout(searchPlayers, 300);
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

async function handleHasAllRolesChange() {
  try {
    filters.hasAllRoles = Boolean(hasAllSelectedRoles?.checked);

    // 선택된 롤이 없으면 AND/OR 분기를 건너뛰고 기본 검색만 실행합니다.
    if (!Array.isArray(filters.selectedRoles)) filters.selectedRoles = [];
    const scrollPositions = pendingPanelScrollPositions ?? capturePlayerPanelScrollPositions();
    pendingPanelScrollPositions = null;
    await searchPlayers(scrollPositions);
  } catch (error) {
    console.error('Has All Selected Roles toggle error:', error);
    renderPlayerGridMessage('역할 필터를 적용할 수 없습니다. 다시 시도해 주세요.', true);
  }
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
  roleTitle.textContent = '역할';
  const roleOptional = document.createElement('span');
  roleOptional.textContent = '선택 사항';
  roleHeading.append(roleTitle, roleOptional);
  roleSubfilter.append(roleHeading, ...rolesPanel.querySelector('.filter-accordion-content').children);
  positionsPanel.querySelector('.filter-accordion-content').append(roleSubfilter);
  rolesPanel.remove();
  renderRoleFilterRows();

  const commands = {
    positions: { icon: '⚽', label: '포지션 / Roles' },
    ovr: { icon: '📊', label: 'OVR / 가격' },
    'sm-wf': { icon: '★', label: '개인기 / 약발' },
    playstyles: { icon: '✨', label: 'PlayStyles' },
    affiliation: { icon: '🌐', label: '소속 / 국적' },
    rarity: { icon: '🃏', label: '카드 등급' },
    stats: { icon: '📈', label: '세부 스탯' },
    miscellaneous: { icon: '⚙️', label: '피지컬 / 기타' },
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
    content.setAttribute('aria-label', `${command.label} 필터`);
    // React PopoverContent의 onPointerDown/onClick stopPropagation과 동일한 보호 계층입니다.
    // 슬라이더, input, button의 기본 동작은 취소하지 않고 문서 바깥 클릭 감지로의 전파만 막습니다.
    content.addEventListener('pointerdown', (event) => event.stopPropagation());
    content.addEventListener('click', (event) => event.stopPropagation());
  });

  document.querySelectorAll('[data-rating-filter]').forEach((button) => {
    const rating = Number(button.dataset.ratingValue);
    const type = button.dataset.ratingFilter === 'sm' ? '개인기' : '약발';
    button.textContent = '★'.repeat(rating);
    button.setAttribute('aria-label', `${type} ${rating}성 이상`);
  });

  filtersContent.setAttribute('aria-label', '선수 필터 명령 바');
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
      ? `${filters.positions.size}${filters.selectedRoles.length ? ` · 역할 ${filters.selectedRoles.length}` : ''}` : '',
    ovr: filters.minOvr !== '' || filters.maxOvr !== ''
      ? `${filters.minOvr || 'Any'}–${filters.maxOvr || 'Any'}`
      : (filters.minPrice !== '' || filters.maxPrice !== '' ? '가격 설정' : ''),
    'sm-wf': filters.minSm || filters.minWf
      ? `SM ${filters.minSm || '–'} · WF ${filters.minWf || '–'}` : '',
    playstyles: filters.selectedPlayStyles.length ? `${filters.selectedPlayStyles.length}` : '',
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

async function searchPlayers(scrollPositions = capturePlayerPanelScrollPositions()) {
  window.clearTimeout(playerSearchTimer);
  playerSearchAbort?.abort();
  const requestId = ++playerSearchRequest;
  playerSearchAbort = new AbortController();
  const signal = playerSearchAbort.signal;
  updateCommandSummaries();
  playerLoadMore.hidden = true;
  playerLoadMore.disabled = true;
  playerPaginationStatus.textContent = '';
  playerGrid.setAttribute('aria-busy', 'true');
  setPlayerGridLoading();
  try {
    const rows = await fetchPlayers(supabase, filters, signal);
    if (requestId !== playerSearchRequest) return;
    const cards = rows.map(normalizeBrowserPlayerCard).filter(Boolean);
    const scored = scoreSearchResults(cards, [...filters.positions], filters.onlyPrimary);
    // Score annotations must not replace the database's overall-descending order.
    const byId = new Map(scored.map(card => [String(card.id), card]));
    renderPlayerGrid(cards.map(card => byId.get(String(card.id))), scrollPositions);
    playerResultCount.textContent = cards.length + '명 표시 · 전체 DB 검색';
    playerPaginationStatus.textContent = '모든 조건을 만족하는 카드 중 오버롤 상위 50개까지 표시합니다.';
  } catch (error) {
    if (requestId !== playerSearchRequest || signal.aborted) return;
    console.error('Player filter error:', error?.message ?? error);
    renderPlayerGridMessage('선수 목록을 불러오지 못했습니다. 다시 시도해 주세요.', true, scrollPositions);
    playerPaginationStatus.textContent = 'DB 검색에 실패했습니다. 다시 시도해 주세요.';
    playerLoadMore.hidden = false;
    playerLoadMore.textContent = '다시 시도';
  } finally {
    if (requestId === playerSearchRequest) {
      playerLoadMore.disabled = false;
      playerGrid.classList.remove('is-loading');
      playerGrid.setAttribute('aria-busy', 'false');
    }
  }
}

async function loadPlaystyleFilterOptions() {
  playstyleFilterGrid.textContent = '플레이스타일을 불러오는 중…';
  try {
    renderPlaystyleFilterButtons(await fetchPlaystyleOptions(supabase));
  } catch (error) {
    console.error('Playstyle master lookup failed:', error);
    playstyleFilterGrid.textContent = '플레이스타일을 불러오지 못했습니다. ';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = '다시 시도';
    retry.addEventListener('click', loadPlaystyleFilterOptions);
    playstyleFilterGrid.append(retry);
  }
}

function renderPlaystyleFilterButtons(options) {
  playstyleFilterGrid.replaceChildren();
  options.forEach(({ id, name }) => {
    const item = document.createElement('div');
    item.className = 'playstyle-filter-item';
    const label = document.createElement('p');
    label.textContent = name;
    item.append(label);
    ['normal', 'plus'].forEach((level) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = level === 'plus' ? 'playstyle-filter-button is-plus' : 'playstyle-filter-button';
      button.textContent = level === 'plus' ? 'Plus' : 'Normal';
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', name + ' ' + button.textContent);
      button.addEventListener('click', () => togglePlaystyleFilter(id, level, button));
      item.append(button);
    });
    playstyleFilterGrid.append(item);
  });
}

function togglePlaystyleFilter(id, level, button) {
  const selectedIndex = filters.selectedPlayStyles.findIndex(
    (playstyle) => playstyle.id === id && playstyle.level === level,
  );
  if (selectedIndex >= 0) filters.selectedPlayStyles.splice(selectedIndex, 1);
  else filters.selectedPlayStyles.push({ id, level });
  const isSelected = selectedIndex < 0;
  button.classList.toggle('is-selected', isSelected);
  button.setAttribute('aria-pressed', String(isSelected));
  searchPlayers();
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
  replaceMasterOptions(clubFilter, '전체 클럽', clubsForLeague(affiliationCatalog.clubs, leagueFilter.value), filters.club);
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
    message.textContent = '소속 목록 불러오기 실패 · 다시 시도';
    message.addEventListener('click', () => { message.remove(); loadAffiliationFilterOptions(); });
    nationFilter.parentElement.append(message);
  }
}

function renderAffiliationOptions() {
  replaceMasterOptions(nationFilter, '전체 국가', affiliationCatalog.nations, filters.nation);
  replaceMasterOptions(leagueFilter, '전체 리그', affiliationCatalog.leagues, filters.league);
  renderSearchableSelect(nationFilter, affiliationCatalog.nations);
  replaceMasterOptions(managerNationSelect, '국가를 선택하세요', affiliationCatalog.nations, managerState?.nationId ?? '');
  replaceMasterOptions(managerLeagueSelect, '리그를 선택하세요', affiliationCatalog.leagues, managerState?.leagueId ?? '');
  renderSearchableSelect(managerNationSelect, affiliationCatalog.nations);
  renderSearchableSelect(managerLeagueSelect, affiliationCatalog.leagues);
  renderClubOptions();
}

function renderRoleFilterRows() {
  roleFilterList.replaceChildren();
  const selectedPositions = [...filters.positions];
  const subfilter = roleFilterList.closest('.position-role-subfilter');
  if (subfilter) subfilter.hidden = selectedPositions.length === 0;

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = 'role-all-chip';
  allChip.classList.toggle('is-selected', filters.selectedRoles.length === 0);
  allChip.setAttribute('aria-pressed', String(filters.selectedRoles.length === 0));
  allChip.textContent = '전체 / 지정 안 함';
  allChip.addEventListener('click', () => {
    filters.selectedRoles = [];
    filters.hasAllRoles = false;
    hasAllSelectedRoles.checked = false;
    renderRoleFilterRows();
    searchPlayers();
  });
  roleFilterList.append(allChip);

  ROLE_DATA.filter(({ pos }) => selectedPositions.includes(pos)).forEach(({ pos, roles }) => {
    const group = document.createElement('section');
    group.className = 'role-filter-group';
    const heading = document.createElement('h3');
    heading.textContent = pos;
    group.append(heading);
    roles.forEach((roleName) => {
      const roleIsActive = filters.selectedRoles.some(
        (role) => role.position === pos && role.name === roleName,
      );
      const row = document.createElement('div');
      row.className = 'role-option-row';
      row.classList.toggle('is-active', roleIsActive);
      const roleChip = document.createElement('span');
      roleChip.className = 'role-name-chip';
      roleChip.textContent = roleName;

      const levels = document.createElement('div');
      levels.className = 'role-level-toggles';
      levels.setAttribute('aria-label', `${pos} ${roleName} 역할 레벨`);
      [1, 2].forEach((level) => {
        const selected = isRoleSelected(pos, roleName, level);
        const levelButton = document.createElement('button');
        levelButton.type = 'button';
        levelButton.textContent = level === 2 ? 'Role++' : 'Role+';
        levelButton.classList.toggle('is-selected', selected);
        levelButton.setAttribute('aria-pressed', String(selected));
        levelButton.setAttribute('aria-label', `${pos} ${roleName} ${level === 2 ? 'Role++' : 'Role+'} 필터`);
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

  const requireAllSwitch = hasAllSelectedRoles.closest('.filter-switch');
  if (requireAllSwitch) requireAllSwitch.hidden = filters.selectedRoles.length === 0;
}

function isRoleSelected(position, name, level) {
  return filters.selectedRoles.some(
    (role) => role.position === position && role.name === name && role.level === level,
  );
}

function toggleRoleFilter(position, name, level) {
  const roleIndex = filters.selectedRoles.findIndex(
    (role) => role.position === position && role.name === name && role.level === level,
  );
  if (roleIndex >= 0) filters.selectedRoles.splice(roleIndex, 1);
  else filters.selectedRoles.push({ position, name, level });
}

function clearAllFilters() {
  Object.assign(filters, createDefaultFilters());
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
  hasAllSelectedRoles.checked = false;
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
  const tone = { '가성비 좋음': 'good', '가성비 보통': 'average', '가성비 좋지 않음': 'poor' }[grade];
  const badge = document.createElement('small');
  badge.className = `value-score-badge value-score-${tone}`;
  badge.textContent = grade;
  badge.setAttribute('aria-label', `가성비 등급: ${grade}`);
  return badge;
}

function renderPlayerGrid(cards, scrollPositions = null) {
  playerGrid.classList.remove('is-loading');
  playerGrid.replaceChildren();
  playerResultCount.textContent = `${cards.length}명의 선수를 찾았습니다.`;
  if (!cards.length) {
    renderPlayerGridMessage('조건에 맞는 선수가 없습니다. 필터를 조정해 보세요.', false, scrollPositions);
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
  if (isError) playerResultCount.textContent = '검색 결과를 불러오지 못했습니다.';
  restorePlayerPanelScrollPositions(scrollPositions);
}

function setPlayerGridLoading() {
  if (playerGrid.childElementCount) {
    playerGrid.classList.add('is-loading');
    playerResultCount.textContent = '선수 목록을 불러오는 중입니다…';
    return;
  }
  renderPlayerGridMessage('선수 목록을 불러오는 중입니다…');
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
  const position = slot.dataset.position;
  modal.hidden = false;
  requestAnimationFrame(() => modalPlayerSearchInput.focus());
  modalTitle.textContent = `${position} 선수 선택`;
  modalDescription.textContent = `${position} 포지션 카드를 불러오는 중…`;
  renderMessage('선수 목록을 불러오는 중입니다…');

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
  renderMessage('선수 목록을 불러오는 중입니다…');
}

async function loadModalPlayerPage() {
  if (modal.hidden || !activeSlot) return;
  const ticket = modalPager.begin();
  if (!ticket) return;
  const requestId = modalRequest;
  const position = activeSlot.dataset.position;
  modalAbort = new AbortController();
  modalLoadMore.disabled = true;
  modalLoadMore.textContent = '불러오는 중…';
  try {
    const rows = await fetchModalPlayerPage(supabase, {
      position: normalizePosition(position), keyword: modalPlayerSearchInput.value,
      offset: ticket.offset, signal: modalAbort.signal,
    });
    if (requestId !== modalRequest || modal.hidden) return;
    const selectedCardIds = getSelectedCardIds(position);
    const cards = rows.map(normalizeBrowserPlayerCard).filter(Boolean)
      .filter(card => !selectedCardIds.has(String(card.id)));
    if (!modalPager.complete(ticket, rows, cards)) return;
    modalDescription.textContent = `${normalizePosition(position)} · ${modalPager.state.cards.length}개 표시 · 주/보조 포지션 포함`;
    renderPlayerList(modalPager.state.cards, normalizePosition(position));
    if (!modalPager.state.cards.length) renderMessage(modalPager.state.hasMore
      ? '현재 페이지에 선택 가능한 선수가 없습니다. 더 보기를 눌러 주세요.'
      : '조건에 맞는 선수가 없습니다.');
  } catch (error) {
    if (requestId !== modalRequest || modal.hidden) return;
    modalPager.fail(ticket);
    modalDescription.textContent = '선수 목록을 불러오지 못했습니다. 더 보기로 다시 시도해 주세요.';
    if (!modalPager.state.cards.length) renderMessage('DB 연결 오류: ' + error.message, true);
  } finally {
    if (requestId === modalRequest && !modal.hidden) {
      modalLoadMore.hidden = !modalPager.state.hasMore;
      modalLoadMore.disabled = false;
      modalLoadMore.textContent = '더 보기 (30명)';
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
    club_short_name: unwrapRelation(cardVersion.clubs)?.short_name,
    club_id: cardVersion.club_id,
    league: unwrapRelation(cardVersion.leagues)?.name,
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
        if (name) normalized.set(`${name.toLowerCase()}|${Boolean(forcedPlus)}`, { name, isPlus: Boolean(forcedPlus) });
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
      normalized.set(`${cleanName.toLowerCase()}|${isPlus || plusFromName}`, {
        name: cleanName,
        isPlus: isPlus || plusFromName,
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

function renderPlayerList(cards, targetPosition) {
  modalPlayerCards = scoreModalPlayers(cards, targetPosition);
  renderFilteredPlayerList();
}

function updateModalPlayerSearch() {
  modalPlayerSearchClear.hidden = !modalPlayerSearchInput.value;
  resetModalSearch();
  modalSearchTimer = setTimeout(() => loadModalPlayerPage(), 300);
}

function buildPlayerCard(card, options) {
  return createPlayerCard(card, {
    getCardName, getCardRating, getCardPosition, getChemistryEntityLogo,
    createPlaystyleBadges, unwrapRelation, affiliationCatalog, ...options,
  });
}

function renderFilteredPlayerList() {
  playerList.replaceChildren();
  modalPlayerCards.forEach(card => {
    const article = buildPlayerCard(card, {
      actionLabel: '선수 선택',
      textAffiliations: true,
      onActivate: () => {
        if (!activeSlot) return;
        placeCard(activeSlot, card);
        status.textContent = `${getCardName(card)} 선수를 ${activeSlot.dataset.position} 슬롯에 배치했습니다.`;
        closeModal();
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
  status.textContent = `${slotKey} 슬롯에서 선수를 제거했습니다.`;
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
  positionLabel.textContent = slotKey;
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
  const bottom = document.createElement('span');
  bottom.className = 'slot-card-bottom';
  body.append(top, bottom);
  slot.append(body);

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
  removeButton.setAttribute('aria-label', `${name} 선수 제거`);
  removeButton.textContent = '×';
  removeButton.addEventListener('click', (event) => handleRemovePlayer(event, slot.dataset.position));
  const detailButton = document.createElement('button');
  detailButton.className = 'detail-player';
  detailButton.type = 'button';
  detailButton.setAttribute('aria-label', name + ' 선수 상세 보기');
  detailButton.title = '상세 보기';
  detailButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg>';
  detailButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const selectedCard = squad[slot.dataset.position]?.card;
    if (selectedCard) playerDetail.open(selectedCard);
  });
  cardActions.append(lockButton, ownedButton, detailButton, removeButton);
  top.append(cardActions);
  updateSlotLockUI(slot);
  updateSlotOwnedUI(slot);

  const content = document.createElement('span');
  content.className = 'slot-card-content';
  const affiliations = document.createElement('small');
  affiliations.className = 'slot-affiliations';
  const nation = document.createElement('span');
  nation.className = 'slot-nation';
  if (card.nation_flag_url?.trim()) {
    const flag = document.createElement('img');
    flag.src = card.nation_flag_url;
    flag.alt = card.nation || '국기';
    flag.title = card.nation || '국기';
    flag.addEventListener('error', () => flag.remove(), { once: true });
    nation.append(flag);
  }
  for (const key of ['league', 'club']) {
    const label = document.createElement('span');
    label.className = `slot-${key}`;
    label.textContent = card[`${key}_short_name`]?.trim() || '—';
    label.title = card[key] || `${key === 'league' ? '리그' : '클럽'} 정보 없음`;
    affiliations.append(label);
    if (key === 'league') affiliations.append(nation);
  }
  top.append(affiliations);
  const nameElement = document.createElement('strong');
  nameElement.textContent = name;
  nameElement.title = name;
  const rarityElement = document.createElement('span');
  rarityElement.className = 'slot-rarity';
  rarityElement.textContent = card.version || 'Standard';
  rarityElement.title = rarityElement.textContent;
  const skillFoot = document.createElement('span');
  skillFoot.className = 'slot-skill-foot-line';
  skillFoot.textContent = `SM ${card.sm ?? '-'}★ / WF ${card.wf ?? '-'}★`;
  content.append(nameElement, rarityElement);
  bottom.append(skillFoot);
  body.insertBefore(content, bottom);
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
  status.textContent = `${getCardName(entry.card)} 선수를 ${isLocked ? '고정했습니다.' : '고정 해제했습니다.'}`;
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
    lockButton.setAttribute('aria-label', `${getCardName(entry.card)} 선수 ${isLocked ? '고정 해제' : '고정'}`);
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
  status.textContent = `${getCardName(entry.card)} 선수를 ${entry.isOwned ? '보유 중으로 설정했습니다.' : '미보유로 설정했습니다.'}`;
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
    ownedButton.dataset.tooltip = isOwned ? '보유 중 (비용 0원)' : '미보유 (비용 포함)';
    ownedButton.setAttribute('aria-label', `${getCardName(entry.card)} 선수 ${isOwned ? '미보유로 변경' : '보유 중으로 변경'}`);
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
    ? `고정되지 않은 선수 ${clearedSlots.length}명과 감독 정보를 초기화했습니다.`
    : '제거할 수 있는 고정 해제 선수가 없습니다.';
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
  status.textContent = '감독 설정을 저장했습니다.';
}

function removeManager() {
  managerState = null;
  renderManagerSlot();
  closeManagerModal();
  updateSquadChemistry();
  status.textContent = '감독 정보를 해제했습니다.';
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
    managerSlot.innerHTML = '<span class="manager-empty"><b>＋</b> 감독 추가</span>';
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
    status.textContent = `${originPosition}와 ${targetPosition} 슬롯의 선수를 교체했습니다.`;
  } else {
    resetSlot(originSlot, false);
    status.textContent = `${getCardName(originCard)} 선수를 ${originPosition}에서 ${targetPosition}(으)로 이동했습니다.`;
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
    slot.querySelector('.slot-chemistry')?.remove();
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

    const badge = document.createElement('span');
    badge.className = `slot-chemistry chem-${chemistry}`;
    badge.setAttribute('aria-label', `케미스트리 ${chemistry}점`);
    const diamonds = Array.from({ length: 3 }, (_, index) => `<i class="${index < chemistry ? 'is-filled' : ''}">◆</i>`).join('');
    badge.innerHTML = `${diamonds}<b>${chemistry}</b>`;
    slot.querySelector('.slot-card-bottom').append(badge);
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
  budgetPercentage.textContent = budget.level === 'unlimited' ? '제한 없음' : `${budget.percentage.toFixed(1)}% 사용`;
  budgetRemaining.textContent = targetBudget > 0 && budget.level !== 'over'
    ? `잔여 ${formatter.format(Math.max(0, targetBudget - totalCost))} C` : '';
  const isOverBudget = budget.level === 'over';
  totalCostSummary.classList.toggle('is-over-budget', isOverBudget);
  budgetWarning.hidden = !isOverBudget;
  budgetWarning.textContent = isOverBudget ? `⚠️ 예산 초과 (+${formatter.format(budget.overAmount)} 코인)` : '';
}

const CHEMISTRY_GROUPS = [
  { key: 'club', title: '클럽', label: 'CLUB', thresholds: [2, 4, 7], groupSizes: [2, 2, 3] },
  { key: 'league', title: '리그', label: 'LEAGUE', thresholds: [3, 5, 8], groupSizes: [3, 2, 3] },
  { key: 'nation', title: '국가', label: 'NATION', thresholds: [2, 5, 8], groupSizes: [2, 3, 3] },
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
  return field ? card[field].trim() : `알 수 없는 ${CHEMISTRY_GROUPS.find((group) => group.key === key)?.title ?? '항목'}`;
}

function getChemistryEntityKey(card, groupKey, entityId) {
  const name = getChemistryEntityName(card, groupKey);
  const isUnknown = name.startsWith('알 수 없는 ');
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
    heading.innerHTML = `<div><span>${group.label}</span><h3>${group.title}</h3></div><small>${group.thresholds.join(' · ')}명</small>`;
    section.append(heading);

    const rows = getChemistryGroupRows(group);
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'chemistry-empty';
      empty.textContent = '해당되는 선수를 배치하면 표시됩니다.';
      section.append(empty);
    } else {
      rows.forEach((row) => {
        const item = document.createElement('div');
        item.className = `chemistry-row${row.isIconBonus ? ' is-icon-bonus' : ''}`;
        if (row.isIconBonus) {
          item.setAttribute('aria-label', `Icons, 모든 리그에 ${row.count}명 가중치 기여`);
          item.innerHTML = `<span class="chemistry-identity"><span class="chemistry-mark is-icon">◆</span><span><span class="chemistry-row-name">Icons</span><small>ICON BONUS</small></span></span><span class="chemistry-icon-badge">모든 리그 +${row.count}</span>`;
        } else {
          item.setAttribute('aria-label', `${row.name}, 가중치 ${row.count}명, 케미스트리 ${row.level}단계`);
          const peopleGroups = renderChemistryPeopleGroups(row.count, group.groupSizes);
          const diamonds = row.level ? '◆'.repeat(row.level) : '—';
          item.innerHTML = `<span class="chemistry-identity"><span class="chemistry-mark">${group.key === 'nation' ? '⚑' : group.key === 'league' ? '◉' : '⬢'}</span><span><span class="chemistry-row-name" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span><small>${row.count}명</small></span></span><span class="chemistry-people-groups" aria-label="${group.groupSizes.join('-')} 인원 그룹 중 ${Math.min(row.count, group.groupSizes.reduce((total, size) => total + size, 0))}명 활성화">${peopleGroups}</span><span class="chemistry-diamonds is-level-${row.level}" aria-label="${row.level}점 기여">${diamonds}</span>`;
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

  return `[ ${height}cm / ${weight}kg / ${age}세 / ${gender} ] | Foot: ${preferredFoot} | Accele: ${acceleType} | Body: ${bodyType}`;
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
