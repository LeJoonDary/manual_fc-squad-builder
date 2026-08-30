import { createClient } from '@supabase/supabase-js';
import { adaptChemistryPlayerCard, calculateChemistry, isPositionMatched, normalizeChemistryPosition } from './utils/chemistry.ts';
import { clearUnlockedSquadEntries, createSquadEntry, isSquadSlotLocked, toggleSquadSlotLock } from './utils/squadLock.ts';

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
const managerNameInput = document.querySelector('#manager-name');
const managerLeagueSelect = document.querySelector('#manager-league');
const managerNationSelect = document.querySelector('#manager-nation');
const removeManagerButton = document.querySelector('#remove-manager');
const chemistryBreakdown = document.querySelector('#chemistry-breakdown');
const modal = document.querySelector('#player-modal');
const modalTitle = document.querySelector('#modal-title');
const modalDescription = document.querySelector('#modal-description');
const modalPlayerSearchInput = document.querySelector('#modal-player-search-input');
const modalPlayerSearchClear = document.querySelector('#modal-player-search-clear');
const playerList = document.querySelector('#player-list');
const playerDetailModal = document.querySelector('#player-detail-modal');
const playerDetailIdentity = document.querySelector('#player-detail-identity');
const playerDetailBio = document.querySelector('#player-detail-bio');
const playerDetailStats = document.querySelector('#player-detail-stats');
const playerDetailRoles = document.querySelector('#player-detail-roles');
const playerDetailPlaystyles = document.querySelector('#player-detail-playstyles');
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
const STAT_KEYS = ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
const statFilterInputs = STAT_KEYS.flatMap((stat) => [
  document.querySelector(`#min-${stat}`), document.querySelector(`#max-${stat}`),
]);

// Vanilla DOM 구조에서 <FilterBar /> 마운트와 동일한 역할을 합니다.
// 검색 헤더 바로 아래, 선수 그리드 바로 위에 기존 필터 DOM을 배치합니다.
if (filterBarMount && filterBar) filterBarMount.replaceWith(filterBar);

const playerFilters = {
  name: '', minOvr: '', maxOvr: '', minPrice: '', maxPrice: '', minSm: null, minWf: null, positions: new Set(), onlyPrimary: false, hasAllPositions: false,
  selectedPlayStyles: [], requireAllPlaystyles: false, minPlaystyles: '', maxPlaystyles: '', minPlaystylesPlus: '', maxPlaystylesPlus: '',
  selectedRoles: [], hasAllRoles: false,
  acceleTypes: new Set(), preferredFoot: '', gender: '', bodyTypes: new Set(),
  minHeight: '', maxHeight: '', minWeight: '', maxWeight: '', minAge: '', maxAge: '',
  nation: '', league: '', club: '', rarities: new Set(),
  stats: Object.fromEntries(STAT_KEYS.map((stat) => [stat, { min: '', max: '' }])),
};
const filterAccordionState = { ovr: true, positions: true, price: true, 'sm-wf': true, playstyles: true, roles: false, affiliation: true, rarity: true, stats: true, miscellaneous: true };
const OVR_COLUMN = 'overall';
const PLAYSTYLE_NAMES = [
  'Quick Step', 'Finesse Shot', 'Power Shot', 'Incisive Pass', 'Whipped Pass', 'Rapid', 'Technical',
  'Anticipate', 'Intercept', 'Bruiser', 'Aerial', 'Long Ball Pass', 'Trivela', 'Block', 'Far Throw',
];
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
let playerDetailRequest = 0;
let pendingPanelScrollPositions = null;
let activeSlot = null;
let managerState = null;
let modalPlayerCards = [];
let selectedPlayer = null;
let dragOriginPosition = null;
let suppressSlotClick = false;
const squad = {};
let affiliationCatalog = [];
const MOCK_CHEMISTRY_CARDS = [
  { id: 'mock-icon-beckham', name: 'David Beckham', version: 'Icon', overall: 92, position: 'RM', altPositions: ['CM'], nation: 'England', nationId: 1, league: 'Icons', leagueId: 900, club: 'Icons', clubId: 900, isIcon: true, isMock: true },
  { id: 'mock-icon-zidane', name: 'Zinedine Zidane', version: 'Icon', overall: 94, position: 'CAM', altPositions: ['CM'], nation: 'France', nationId: 2, league: 'Icons', leagueId: 900, club: 'Icons', clubId: 900, isIcon: true, isMock: true },
  { id: 'mock-hero-crouch', name: 'Peter Crouch', version: 'Hero', overall: 88, position: 'ST', altPositions: [], nation: 'England', nationId: 1, league: 'Premier League', leagueId: 100, club: 'Heroes', clubId: 901, isHero: true, isMock: true },
  { id: 'mock-hero-morientes', name: 'Fernando Morientes', version: 'Hero', overall: 89, position: 'ST', altPositions: [], nation: 'Spain', nationId: 3, league: 'LALIGA', leagueId: 101, club: 'Heroes', clubId: 901, isHero: true, isMock: true },
];

// card_versions 자체에서 사용하는 선택 구문입니다. 역할 관계를 여기 포함해 포지션별/전체
// 조회가 모두 같은 card_roles 데이터를 받도록 합니다.
const CARD_VERSION_SELECT = `
  id,
  version,
  overall,
  sm,
  wf,
  price,
  club,
  league,
  image_url,
  preferred_foot,
  accele_type,
  body_type,
  players!inner (
    name,
    nation,
    height,
    weight,
    age,
    gender
  ),
  player_stats (
    pac,
    sho,
    pas,
    dri,
    def,
    phy
  ),
  card_playstyles (
    is_plus,
    playstyles ( name )
  ),
  card_roles (
    role_level,
    roles ( position, role_name )
  )
`;

const PLAYER_CARD_SELECT = `
  is_primary,
  positions!inner ( name ),
  card_versions!inner (${CARD_VERSION_SELECT})
`;

const PLAYER_BROWSER_SELECT = `
  *,
  players!inner (*),
  player_stats (*),
  card_playstyles (
    is_plus,
    playstyles ( name )
  ),
  card_roles (
    role_level,
    roles ( position, role_name )
  ),
  card_positions!inner (
    is_primary,
    positions!inner ( name )
  )
`;

// 상세 모달은 card_roles와 roles를 명시적으로 중첩 조인해 역할 정보를 단건 조회합니다.
const PLAYER_DETAIL_SELECT = `
  *,
  players!inner (*),
  player_stats (*),
  card_playstyles (
    is_plus,
    playstyles ( name )
  ),
  card_roles (
    role_level,
    roles (
      position,
      role_name
    )
  ),
  card_positions!inner (
    is_primary,
    positions!inner ( name )
  )
`;

document.querySelectorAll('.slot').forEach((slot) => {
  slot.addEventListener('click', () => {
    if (!suppressSlotClick && !isSquadSlotLocked(squad[slot.dataset.position])) openPlayerModal(slot);
  });
  slot.addEventListener('dragstart', handleSlotDragStart);
  slot.addEventListener('dragover', handleSlotDragOver);
  slot.addEventListener('dragenter', handleSlotDragEnter);
  slot.addEventListener('dragleave', handleSlotDragLeave);
  slot.addEventListener('drop', handleSlotDrop);
  slot.addEventListener('dragend', handleSlotDragEnd);
});

clearSquadButton.addEventListener('click', clearUnlockedPlayers);
managerSlot.addEventListener('click', openManagerModal);
document.querySelectorAll('[data-close-manager-modal]').forEach((button) => button.addEventListener('click', closeManagerModal));
managerForm.addEventListener('submit', saveManager);
removeManagerButton.addEventListener('click', removeManager);

tabButtons.forEach((button) => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});

playerNameSearch.addEventListener('input', (event) => {
  playerFilters.name = event.target.value.trim();
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
    playerFilters[input === minOvrInput ? 'minOvr' : 'maxOvr'] = event.target.value;
    schedulePlayerSearch();
  });
});

[minPriceInput, maxPriceInput].forEach((input) => {
  input.addEventListener('input', (event) => {
    playerFilters[input === minPriceInput ? 'minPrice' : 'maxPrice'] = event.target.value;
    schedulePlayerSearch();
  });
});

document.querySelectorAll('[data-position-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    const position = button.dataset.positionFilter;
    if (playerFilters.positions.has(position)) {
      playerFilters.positions.delete(position);
      playerFilters.selectedRoles = playerFilters.selectedRoles.filter((role) => role.position !== position);
    } else {
      playerFilters.positions.add(position);
    }
    button.classList.toggle('is-selected', playerFilters.positions.has(position));
    button.setAttribute('aria-pressed', String(playerFilters.positions.has(position)));
    renderRoleFilterRows();
    searchPlayers();
  });
});

document.querySelectorAll('[data-rating-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    const filterName = button.dataset.ratingFilter === 'sm' ? 'minSm' : 'minWf';
    const selectedValue = Number(button.dataset.ratingValue);
    playerFilters[filterName] = playerFilters[filterName] === selectedValue ? null : selectedValue;
    document.querySelectorAll(`[data-rating-filter="${button.dataset.ratingFilter}"]`).forEach((item) => {
      item.classList.toggle('is-selected', Number(item.dataset.ratingValue) === playerFilters[filterName]);
    });
    searchPlayers();
  });
});

renderPlaystyleFilterButtons();
renderRoleFilterRows();
setupFilterCommandBar();
void loadAffiliationFilterOptions();

[nationFilter, leagueFilter, clubFilter].forEach((select) => {
  select.addEventListener('change', () => {
    playerFilters.nation = nationFilter.value;
    playerFilters.league = leagueFilter.value;
    if (select === leagueFilter) renderClubOptions();
    playerFilters.club = clubFilter.value;
    searchPlayers();
  });
});

document.querySelectorAll('[data-rarity-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    const rarity = button.dataset.rarityFilter;
    playerFilters.rarities.has(rarity) ? playerFilters.rarities.delete(rarity) : playerFilters.rarities.add(rarity);
    const selected = playerFilters.rarities.has(rarity);
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    searchPlayers();
  });
});

STAT_KEYS.forEach((stat) => {
  ['min', 'max'].forEach((bound) => {
    document.querySelector(`#${bound}-${stat}`).addEventListener('input', (event) => {
      playerFilters.stats[stat][bound] = event.target.value;
      schedulePlayerSearch();
    });
  });
});

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
      const filterSet = filterName === 'accele' ? playerFilters.acceleTypes : playerFilters.bodyTypes;
      filterSet.has(value) ? filterSet.delete(value) : filterSet.add(value);
      button.classList.toggle('is-selected', filterSet.has(value));
    } else {
      const stateKey = filterName === 'foot' ? 'preferredFoot' : 'gender';
      playerFilters[stateKey] = playerFilters[stateKey] === value ? '' : value;
      document.querySelectorAll(`[data-misc-filter="${filterName}"]`).forEach((item) => {
        item.classList.toggle('is-selected', item.dataset.miscValue === playerFilters[stateKey]);
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
    playerFilters[filterName] = event.target.value;
    schedulePlayerSearch();
  });
});

setupDualRangeControls();

requireAllPlaystyles.addEventListener('change', () => {
  playerFilters.requireAllPlaystyles = requireAllPlaystyles.checked;
  searchPlayers();
});

[
  [minPlaystylesInput, 'minPlaystyles'], [maxPlaystylesInput, 'maxPlaystyles'],
  [minPlaystylesPlusInput, 'minPlaystylesPlus'], [maxPlaystylesPlusInput, 'maxPlaystylesPlus'],
].forEach(([input, filterName]) => {
  input.addEventListener('input', (event) => {
    playerFilters[filterName] = event.target.value;
    schedulePlayerSearch();
  });
});

[onlyPrimaryPositions, hasAllSelectedPositions].forEach((toggle) => {
  toggle.addEventListener('change', () => {
    playerFilters.onlyPrimary = onlyPrimaryPositions.checked;
    playerFilters.hasAllPositions = hasAllSelectedPositions.checked;
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

document.querySelectorAll('[data-close-detail-modal]').forEach((button) => {
  button.addEventListener('click', closePlayerDetailModal);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!playerDetailModal.hidden) closePlayerDetailModal();
  else if (!modal.hidden) closeModal();
  else closeCommandPopovers();
});

document.addEventListener('pointerdown', (event) => {
  const isInsidePopover = event.composedPath().some((node) => node instanceof Element && node.classList.contains('command-filter'));
  if (!isInsidePopover) closeCommandPopovers();
});

function setActiveTab(tabName) {
  appShell.classList.toggle('is-players-active', tabName === 'players');
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
  playerSearchTimer = window.setTimeout(searchPlayers, 250);
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
    playerFilters.hasAllRoles = Boolean(hasAllSelectedRoles?.checked);

    // 선택된 롤이 없으면 AND/OR 분기를 건너뛰고 기본 검색만 실행합니다.
    if (!Array.isArray(playerFilters.selectedRoles)) playerFilters.selectedRoles = [];
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
    positions: playerFilters.positions.size
      ? `${playerFilters.positions.size}${playerFilters.selectedRoles.length ? ` · 역할 ${playerFilters.selectedRoles.length}` : ''}` : '',
    ovr: playerFilters.minOvr !== '' || playerFilters.maxOvr !== ''
      ? `${playerFilters.minOvr || 'Any'}–${playerFilters.maxOvr || 'Any'}`
      : (playerFilters.minPrice !== '' || playerFilters.maxPrice !== '' ? '가격 설정' : ''),
    'sm-wf': playerFilters.minSm || playerFilters.minWf
      ? `SM ${playerFilters.minSm || '–'} · WF ${playerFilters.minWf || '–'}` : '',
    playstyles: playerFilters.selectedPlayStyles.length ? `${playerFilters.selectedPlayStyles.length}` : '',
    affiliation: [playerFilters.nation, playerFilters.league, playerFilters.club].filter(Boolean).length || '',
    rarity: playerFilters.rarities.size || '',
    stats: STAT_KEYS.filter((stat) => playerFilters.stats[stat].min !== '' || playerFilters.stats[stat].max !== '').length || '',
    miscellaneous: [
      playerFilters.acceleTypes.size, playerFilters.bodyTypes.size, playerFilters.preferredFoot, playerFilters.gender,
      playerFilters.minHeight, playerFilters.maxHeight, playerFilters.minWeight, playerFilters.maxWeight,
      playerFilters.minAge, playerFilters.maxAge,
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
  updateCommandSummaries();
  const requestId = ++playerSearchRequest;
  if (!supabase) {
    renderPlayerGridMessage('Supabase 연결 정보를 설정한 뒤 선수 데이터를 검색할 수 있습니다.', true, scrollPositions);
    return;
  }

  try {
    setPlayerGridLoading();
    let query = supabase
      .from('card_versions')
      .select(PLAYER_BROWSER_SELECT)
      .limit(500);

    if (playerFilters.minOvr !== '') query = query.gte(OVR_COLUMN, Number(playerFilters.minOvr));
    if (playerFilters.maxOvr !== '') query = query.lte(OVR_COLUMN, Number(playerFilters.maxOvr));
    if (playerFilters.minPrice !== '') query = query.gte('price', Number(playerFilters.minPrice));
    if (playerFilters.maxPrice !== '') query = query.lte('price', Number(playerFilters.maxPrice));
    if (playerFilters.minSm !== null) query = query.gte('sm', playerFilters.minSm);
    if (playerFilters.minWf !== null) query = query.gte('wf', playerFilters.minWf);
    if (playerFilters.acceleTypes.size) query = query.in('accele_type', [...playerFilters.acceleTypes]);
    if (playerFilters.preferredFoot) query = query.eq('preferred_foot', playerFilters.preferredFoot);
    if (playerFilters.gender) query = query.eq('players.gender', playerFilters.gender);
    if (playerFilters.bodyTypes.size) query = query.in('body_type', [...playerFilters.bodyTypes]);
    if (playerFilters.minHeight !== '') query = query.gte('players.height', Number(playerFilters.minHeight));
    if (playerFilters.maxHeight !== '') query = query.lte('players.height', Number(playerFilters.maxHeight));
    if (playerFilters.minWeight !== '') query = query.gte('players.weight', Number(playerFilters.minWeight));
    if (playerFilters.maxWeight !== '') query = query.lte('players.weight', Number(playerFilters.maxWeight));
    if (playerFilters.minAge !== '') query = query.gte('players.age', Number(playerFilters.minAge));
    if (playerFilters.maxAge !== '') query = query.lte('players.age', Number(playerFilters.maxAge));
    if (playerFilters.nation) query = query.eq('players.nation', playerFilters.nation);
    if (playerFilters.league) query = query.eq('league', playerFilters.league);
    if (playerFilters.club) query = query.eq('club', playerFilters.club);

    const selectedRoles = Array.isArray(playerFilters.selectedRoles) ? playerFilters.selectedRoles : [];
    if (selectedRoles.length) {
      const selectedRoleIds = await getSelectedRoleIds(selectedRoles);
      if (requestId !== playerSearchRequest) return;
      const matchedCardIds = await getMatchedCardIds(selectedRoleIds, playerFilters.hasAllRoles);
      if (requestId !== playerSearchRequest) return;
      query = query.in('id', matchedCardIds.length ? matchedCardIds : [-1]);
    }

    const { data, error } = await query;
    if (requestId !== playerSearchRequest) return;
    if (error) {
      renderPlayerGridMessage(error.message, true, scrollPositions);
      return;
    }

    const cardsById = new Map();
    const safeCards = Array.isArray(data) ? data : [];
    safeCards.map(normalizeBrowserPlayerCard).filter(Boolean).forEach((card) => {
      if (!cardsById.has(String(card.id))) cardsById.set(String(card.id), card);
    });
    const normalizedSearchTerm = normalizeText(playerFilters.name);
    const cards = [...cardsById.values()]
      .filter((card) => normalizeText(card.name).includes(normalizedSearchTerm))
      .filter((card) => matchesPositions(card, [...playerFilters.positions], playerFilters.onlyPrimary, playerFilters.hasAllPositions))
      .filter((card) => matchesPlaystyles(card))
      .filter((card) => matchesRoles(card))
      .filter((card) => matchesMiscellaneous(card))
      .filter((card) => matchesIdentityAndStats(card))
      .sort((left, right) => Number(getCardRating(right)) - Number(getCardRating(left)));
    renderPlayerGrid(cards, scrollPositions);
  } catch (error) {
    if (requestId !== playerSearchRequest) return;
    console.error('Player filter error:', error);
    renderPlayerGridMessage('필터를 적용하는 중 문제가 발생했습니다. 조건을 다시 확인해 주세요.', true, scrollPositions);
  }
}

function renderPlaystyleFilterButtons() {
  playstyleFilterGrid.replaceChildren();
  PLAYSTYLE_NAMES.forEach((name) => {
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
      button.addEventListener('click', () => togglePlaystyleFilter(name, level, button));
      item.append(button);
    });
    playstyleFilterGrid.append(item);
  });
}

function togglePlaystyleFilter(name, level, button) {
  const selectedIndex = playerFilters.selectedPlayStyles.findIndex(
    (playstyle) => playstyle.name === name && playstyle.level === level,
  );
  if (selectedIndex >= 0) playerFilters.selectedPlayStyles.splice(selectedIndex, 1);
  else playerFilters.selectedPlayStyles.push({ name, level });
  const isSelected = selectedIndex < 0;
  button.classList.toggle('is-selected', isSelected);
  button.setAttribute('aria-pressed', String(isSelected));
  searchPlayers();
}

function matchesPlaystyles(card) {
  const playstyles = (card.playstyles ?? []).map((playstyle) => ({
    name: playstyle.name,
    level: playstyle.isPlus ? 'plus' : 'normal',
  }));
  const normalCount = playstyles.filter((playstyle) => playstyle.level === 'normal').length;
  const plusCount = playstyles.filter((playstyle) => playstyle.level === 'plus').length;
  const { selectedPlayStyles } = playerFilters;

  if (selectedPlayStyles.length) {
    const matchesSelection = (selection) => playstyles.some(
      (playstyle) => playstyle.name === selection.name && playstyle.level === selection.level,
    );
    const matchesSelectedPlaystyles = playerFilters.requireAllPlaystyles
      ? selectedPlayStyles.every(matchesSelection)
      : selectedPlayStyles.some(matchesSelection);
    if (!matchesSelectedPlaystyles) return false;
  }

  return matchesCountRange(normalCount, playerFilters.minPlaystyles, playerFilters.maxPlaystyles)
    && matchesCountRange(plusCount, playerFilters.minPlaystylesPlus, playerFilters.maxPlaystylesPlus);
}

function matchesCountRange(count, min, max) {
  const hasMinimum = min !== '' && min !== null && min !== undefined;
  const hasMaximum = max !== '' && max !== null && max !== undefined;
  if (!hasMinimum && !hasMaximum) return true;

  const numericCount = Number(count);
  if (!Number.isFinite(numericCount)) return false;
  if (hasMinimum && numericCount < Number(min)) return false;
  if (hasMaximum && numericCount > Number(max)) return false;
  return true;
}

function matchesMiscellaneous(card) {
  if (playerFilters.acceleTypes.size && !playerFilters.acceleTypes.has(card.accele_type)) return false;
  if (playerFilters.preferredFoot && card.preferred_foot !== playerFilters.preferredFoot) return false;
  if (playerFilters.gender && card.gender !== playerFilters.gender) return false;
  if (playerFilters.bodyTypes.size && !playerFilters.bodyTypes.has(card.body_type)) return false;
  return matchesCountRange(card.height, playerFilters.minHeight, playerFilters.maxHeight)
    && matchesCountRange(card.weight, playerFilters.minWeight, playerFilters.maxWeight)
    && matchesCountRange(card.age, playerFilters.minAge, playerFilters.maxAge);
}

function getRarityCategory(version) {
  const normalized = String(version ?? '').trim().toLowerCase();
  if (/^gold(?: common| rare)?$/.test(normalized)) return 'Gold';
  if (/^silver(?: common| rare)?$/.test(normalized)) return 'Silver';
  if (/^bronze(?: common| rare)?$/.test(normalized)) return 'Bronze';
  return 'Special';
}

function matchesIdentityAndStats(card) {
  if (playerFilters.nation && card.nation !== playerFilters.nation) return false;
  if (playerFilters.league && card.league !== playerFilters.league) return false;
  if (playerFilters.club && card.club !== playerFilters.club) return false;
  if (playerFilters.rarities.size && !playerFilters.rarities.has(getRarityCategory(card.version))) return false;
  return STAT_KEYS.every((stat) => matchesCountRange(card[stat], playerFilters.stats[stat].min, playerFilters.stats[stat].max));
}

function replaceSelectOptions(select, placeholder, values, selectedValue = '') {
  const options = [new Option(placeholder, ''), ...values.map((value) => new Option(value, value))];
  select.replaceChildren(...options);
  select.value = values.includes(selectedValue) ? selectedValue : '';
}

function renderClubOptions() {
  const selectedLeague = leagueFilter.value;
  const clubs = [...new Set(affiliationCatalog
    .filter((item) => !selectedLeague || item.league === selectedLeague)
    .map((item) => item.club).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  replaceSelectOptions(clubFilter, '전체 클럽', clubs, playerFilters.club);
  playerFilters.club = clubFilter.value;
}

async function loadAffiliationFilterOptions() {
  const fallbackAffiliations = [
    { league: 'Premier League', nation: 'England' }, { league: 'LALIGA EA SPORTS', nation: 'Spain' },
    { league: 'Ligue 1', nation: 'France' }, { league: 'Bundesliga', nation: 'Germany' },
    { league: 'Serie A', nation: 'Italy' }, { league: 'Icons', nation: 'Brazil' },
  ];
  if (!supabase) {
    affiliationCatalog = fallbackAffiliations;
    renderAffiliationOptions();
    return;
  }
  try {
    const { data, error } = await supabase
      .from('card_versions')
      .select('club, league, players!inner(nation)')
      .limit(1000);
    if (error) throw error;
    affiliationCatalog = [...fallbackAffiliations, ...(Array.isArray(data) ? data : []).map((item) => ({
      club: item?.club ?? '',
      league: item?.league ?? '',
      nation: unwrapRelation(item?.players)?.nation ?? '',
    }))];
    renderAffiliationOptions();
  } catch (error) {
    console.error('Affiliation filter options error:', error);
    affiliationCatalog = fallbackAffiliations;
    renderAffiliationOptions();
  }
}

function renderAffiliationOptions() {
  const uniqueSorted = (key) => [...new Set(affiliationCatalog.map((item) => item[key]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  replaceSelectOptions(nationFilter, '전체 국가', uniqueSorted('nation'), playerFilters.nation);
  replaceSelectOptions(leagueFilter, '전체 리그', uniqueSorted('league'), playerFilters.league);
  replaceSelectOptions(managerNationSelect, '국가를 선택하세요', uniqueSorted('nation'), managerState?.nation ?? '');
  replaceSelectOptions(managerLeagueSelect, '리그를 선택하세요', uniqueSorted('league'), managerState?.league ?? '');
  renderClubOptions();
}

function renderRoleFilterRows() {
  roleFilterList.replaceChildren();
  const selectedPositions = [...playerFilters.positions];
  const subfilter = roleFilterList.closest('.position-role-subfilter');
  if (subfilter) subfilter.hidden = selectedPositions.length === 0;

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = 'role-all-chip';
  allChip.classList.toggle('is-selected', playerFilters.selectedRoles.length === 0);
  allChip.setAttribute('aria-pressed', String(playerFilters.selectedRoles.length === 0));
  allChip.textContent = '전체 / 지정 안 함';
  allChip.addEventListener('click', () => {
    playerFilters.selectedRoles = [];
    playerFilters.hasAllRoles = false;
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
      const roleIsActive = playerFilters.selectedRoles.some(
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
  if (requireAllSwitch) requireAllSwitch.hidden = playerFilters.selectedRoles.length === 0;
}

function isRoleSelected(position, name, level) {
  return playerFilters.selectedRoles.some(
    (role) => role.position === position && role.name === name && role.level === level,
  );
}

function toggleRoleFilter(position, name, level) {
  const roleIndex = playerFilters.selectedRoles.findIndex(
    (role) => role.position === position && role.name === name && role.level === level,
  );
  if (roleIndex >= 0) playerFilters.selectedRoles.splice(roleIndex, 1);
  else playerFilters.selectedRoles.push({ position, name, level });
}

function matchesRoles(card) {
  const selectedRoles = Array.isArray(playerFilters.selectedRoles) ? playerFilters.selectedRoles : [];
  if (!selectedRoles.length) return true;

  const matchesSelectedRole = (selectedRole) => {
    return (card.card_roles ?? []).some((cardRole) => {
      const role = unwrapRelation(cardRole.roles);
      const cardRoleLevel = Number(cardRole.role_level);
      return role?.position === selectedRole.position
        && role?.role_name === selectedRole.name
        && (selectedRole.level === 1 ? cardRoleLevel >= 1 : cardRoleLevel === 2);
    });
  };

  return playerFilters.hasAllRoles
    ? selectedRoles.every(matchesSelectedRole)
    : selectedRoles.some(matchesSelectedRole);
}

async function getSelectedRoleIds(selectedRoles = []) {
  if (!Array.isArray(selectedRoles) || !selectedRoles.length) return [];

  try {
    const { data, error } = await supabase
      .from('roles')
      .select('id, position, role_name');
    if (error) throw error;

    return selectedRoles.flatMap((selectedRole) => {
      const role = (Array.isArray(data) ? data : []).find(
        (item) => item?.position === selectedRole?.position && item?.role_name === selectedRole?.name,
      );
      return role?.id === null || role?.id === undefined
        ? []
        : [{ id: role.id, level: Number(selectedRole.level) === 2 ? 2 : 1 }];
    });
  } catch (error) {
    console.error('Role ID lookup error:', error);
    return [];
  }
}

async function getMatchedCardIds(selectedRoles, hasAllRoles) {
  if (!Array.isArray(selectedRoles) || !selectedRoles.length) return [];

  try {
    const selectedRoleIds = [...new Set(selectedRoles.map((role) => role.id))];
    const { data, error } = await supabase
      .from('card_roles')
      .select('card_id, role_id, role_level')
      .in('role_id', selectedRoleIds);
    if (error) throw error;

    const selectedKey = (roleId, level) => `${String(roleId)}:${Number(level)}`;
    const requiredRoleKeys = new Set(selectedRoles.map((role) => selectedKey(role.id, role.level)));
    const safeRoles = (Array.isArray(data) ? data.filter(Boolean) : []).filter((cardRole) => selectedRoles.some(
      (role) => String(role.id) === String(cardRole.role_id)
        && (role.level === 1 ? Number(cardRole.role_level) >= 1 : Number(cardRole.role_level) === 2),
    ));
    if (!hasAllRoles) {
      return [...new Set(safeRoles.map((item) => item?.card_id).filter((cardId) => cardId !== null && cardId !== undefined))];
    }

    const cardRoleKeys = new Map();
    safeRoles.forEach((item) => {
      if (item?.card_id === null || item?.card_id === undefined || item?.role_id === null || item?.role_id === undefined) return;
      const cardId = String(item.card_id);
      if (!cardRoleKeys.has(cardId)) cardRoleKeys.set(cardId, new Set());
      selectedRoles.forEach((role) => {
        if (String(role.id) !== String(item.role_id)) return;
        if (role.level === 1 ? Number(item.role_level) >= 1 : Number(item.role_level) === 2) {
          cardRoleKeys.get(cardId).add(selectedKey(role.id, role.level));
        }
      });
    });

    return [...cardRoleKeys]
      .filter(([, roleKeys]) => [...requiredRoleKeys].every((roleKey) => roleKeys.has(roleKey)))
      .map(([cardId]) => Number(cardId))
      .filter(Number.isFinite);
  } catch (error) {
    console.error('Card role filter error:', error);
    return [];
  }
}

function clearAllFilters() {
  playerFilters.name = '';
  playerFilters.minOvr = '';
  playerFilters.maxOvr = '';
  playerFilters.minPrice = '';
  playerFilters.maxPrice = '';
  playerFilters.minSm = null;
  playerFilters.minWf = null;
  playerFilters.positions.clear();
  playerFilters.onlyPrimary = false;
  playerFilters.hasAllPositions = false;
  playerFilters.selectedPlayStyles = [];
  playerFilters.requireAllPlaystyles = false;
  playerFilters.minPlaystyles = '';
  playerFilters.maxPlaystyles = '';
  playerFilters.minPlaystylesPlus = '';
  playerFilters.maxPlaystylesPlus = '';
  playerFilters.selectedRoles = [];
  playerFilters.hasAllRoles = false;
  playerFilters.acceleTypes.clear();
  playerFilters.preferredFoot = '';
  playerFilters.gender = '';
  playerFilters.bodyTypes.clear();
  playerFilters.minHeight = '';
  playerFilters.maxHeight = '';
  playerFilters.minWeight = '';
  playerFilters.maxWeight = '';
  playerFilters.minAge = '';
  playerFilters.maxAge = '';
  playerFilters.nation = '';
  playerFilters.league = '';
  playerFilters.club = '';
  playerFilters.rarities.clear();
  STAT_KEYS.forEach((stat) => { playerFilters.stats[stat] = { min: '', max: '' }; });

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
  leagueFilter.value = '';
  renderClubOptions();
  statFilterInputs.forEach((input) => { input.value = ''; });
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

const normalizeText = (str) => {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o').replace(/Ø/g, 'O')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
    .replace(/ß/g, 'ss')
    .toLowerCase();
};

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
    secondary_positions: [...new Set(
      positionRows
        .filter((row) => row !== primaryRow)
        .map((row) => unwrapRelation(row.positions)?.name)
        .filter(Boolean),
    )],
  };
}

function matchesPositions(card, selectedPositions, onlyPrimary, hasAll) {
  if (!selectedPositions.length) return true;

  const primary = card.primary_position;
  const allPositions = [primary, ...(card.secondary_positions ?? [])].filter(Boolean);
  if (onlyPrimary) return selectedPositions.includes(primary);
  if (hasAll) return selectedPositions.every((position) => allPositions.includes(position));
  return selectedPositions.some((position) => allPositions.includes(position));
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
    const article = document.createElement('article');
    article.className = 'browser-player-card';
    article.tabIndex = 0;
    article.setAttribute('role', 'button');
    article.setAttribute('aria-label', `${getCardName(card)} 선수 상세 정보 보기`);
    article.addEventListener('click', () => openPlayerDetailModal(card));
    article.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openPlayerDetailModal(card);
      }
    });
    const image = getCardImage(card);
    if (image) {
      const thumbnail = document.createElement('img');
      thumbnail.className = 'browser-player-image';
      thumbnail.src = image;
      thumbnail.alt = '';
      thumbnail.loading = 'lazy';
      thumbnail.addEventListener('error', () => thumbnail.remove());
      article.append(thumbnail);
    }
    const content = document.createElement('div');
    content.className = 'browser-player-content';
    const rating = document.createElement('span');
    rating.className = 'browser-player-rating';
    rating.textContent = getCardRating(card) || '-';
    const name = document.createElement('h3');
    name.textContent = getCardName(card);
    const meta = document.createElement('p');
    meta.textContent = [getCardPosition(card), card.nation, card.club].filter(Boolean).join(' · ') || '카드 정보';
    content.append(rating, name, meta);
    article.append(content);
    playerGrid.append(article);
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

async function openPlayerDetailModal(card) {
  console.log('[DEBUG] Player Raw Data:', card.raw ?? card);
  selectedPlayer = card;
  renderPlayerDetail(card);
  playerDetailModal.hidden = false;
  document.querySelector('#player-detail-close').focus();

  if (!supabase) return;

  const requestId = ++playerDetailRequest;
  const { data: cardDetail, error } = await supabase
    .from('card_versions')
    .select(PLAYER_DETAIL_SELECT)
    .eq('id', card.id)
    .single();

  if (cardDetail) console.log('[DEBUG] Player Raw Data:', cardDetail);

  if (error || requestId !== playerDetailRequest || selectedPlayer?.id !== card.id) return;

  const detailedCard = normalizeBrowserPlayerCard(cardDetail);
  if (!detailedCard) return;
  // Nested Join 결과를 그대로 보존해 Roles 렌더러가 card_roles 배열을 항상 참조하도록 합니다.
  detailedCard.card_roles = asArray(cardDetail.card_roles);
  selectedPlayer = detailedCard;
  renderPlayerDetail(detailedCard);
}

function closePlayerDetailModal() {
  playerDetailModal.hidden = true;
  selectedPlayer = null;
  playerDetailRequest += 1;
}

function renderPlayerDetail(card) {
  const positions = [card.primary_position, ...(card.secondary_positions ?? [])].filter(Boolean);
  playerDetailIdentity.replaceChildren();
  const image = getCardImage(card);
  if (image) {
    const portrait = document.createElement('img');
    portrait.className = 'player-detail-image';
    portrait.src = image;
    portrait.alt = '';
    portrait.addEventListener('error', () => portrait.remove());
    playerDetailIdentity.append(portrait);
  }
  const heading = document.createElement('div');
  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = [getCardRating(card), positions.join(' / ')].filter(Boolean).join(' · ');
  const name = document.createElement('h1');
  name.id = 'player-detail-name';
  name.textContent = getCardName(card);
  const meta = document.createElement('p');
  meta.className = 'player-detail-meta';
  meta.textContent = [card.club, card.nation].filter(Boolean).join(' · ') || '소속 및 국적 정보 없음';
  heading.append(eyebrow, name, meta);
  playerDetailIdentity.append(heading);

  renderDetailSpecs(card);
  renderDetailStats(card);
  renderDetailRoles(card);
  const detailPlaystyles = getPlayStyles(card);
  playerDetailPlaystyles.replaceChildren(
    createPlaystyleBadges({ ...card, playstyles: detailPlaystyles }, Infinity, 'detail-playstyle-badges playstyle-badges'),
  );
  if (!detailPlaystyles.length) {
    playerDetailPlaystyles.textContent = '등록된 특성이 없습니다.';
    if (import.meta.env.DEV) console.log('[PlayerDetail] PlayStyles raw player data:', card.raw ?? card);
  }
}

function renderDetailRoles(card) {
  playerDetailRoles.replaceChildren();
  const roles = getRoles(card)
    .sort((left, right) => left.position.localeCompare(right.position) || left.name.localeCompare(right.name) || right.level - left.level);

  if (!roles.length) {
    playerDetailRoles.textContent = '등록된 역할이 없습니다.';
    return;
  }

  roles.forEach((role) => {
    const badge = document.createElement('span');
    badge.className = role.level === 2 ? 'detail-role-badge is-plus-plus' : 'detail-role-badge is-plus';
    badge.textContent = `${role.position} ${role.name} ${role.level === 2 ? '++' : '+'}`;
    playerDetailRoles.append(badge);
  });
}

function renderDetailSpecs(card) {
  const specs = [
    ['Height', card.height === undefined || card.height === null ? '-' : `${card.height}cm`],
    ['Weight', card.weight === undefined || card.weight === null ? '-' : `${card.weight}kg`],
    ['Age', card.age === undefined || card.age === null ? '-' : `${card.age}세`],
    ['Gender', card.gender ?? '-'],
    ['Preferred Foot', card.preferred_foot ?? '-'],
    ['Skill Moves', card.sm === undefined || card.sm === null ? '-' : `${card.sm}★`],
    ['Weak Foot', card.wf === undefined || card.wf === null ? '-' : `${card.wf}★`],
    ['Accele Type', card.accele_type ?? '-'],
    ['Body Type', card.body_type ?? '-'],
  ];
  playerDetailBio.replaceChildren(...specs.map(([label, value]) => createDetailValue(label, value)));
}

function renderDetailStats(card) {
  const stats = [
    ['PAC', card.pac], ['SHO', card.sho], ['PAS', card.pas],
    ['DRI', card.dri], ['DEF', card.def], ['PHY', card.phy],
  ];
  playerDetailStats.replaceChildren(...stats.map(([label, value]) => createDetailValue(label, value ?? '-')));
}

function createDetailValue(label, value) {
  const item = document.createElement('div');
  const labelElement = document.createElement('span');
  labelElement.textContent = label;
  const valueElement = document.createElement('strong');
  valueElement.textContent = value;
  item.append(labelElement, valueElement);
  return item;
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

  const selectedCardIds = getSelectedCardIds(position);
  const availableMocks = MOCK_CHEMISTRY_CARDS.filter((card) => !selectedCardIds.has(String(card.id)));

  if (!supabase) {
    modalDescription.textContent = '케미스트리 테스트용 Icon / Hero 샘플 카드입니다.';
    renderPlayerList(availableMocks);
    return;
  }

  const { cards, usedFallback, error } = await fetchCardsForPosition(position);
  if (error) {
    modalDescription.textContent = 'DB 선수 목록을 불러오지 못해 케미스트리 샘플 카드만 표시합니다.';
    renderPlayerList(availableMocks);
    return;
  }

  const availableCards = [
    ...availableMocks,
    ...cards.filter((card) => !selectedCardIds.has(String(card.id))),
  ];
  if (!availableCards.length) {
    modalDescription.textContent = `${position}에 배치할 수 있는 카드가 없습니다.`;
    renderMessage('조회된 모든 카드가 이미 다른 스쿼드 슬롯에 배치되어 있습니다.');
    return;
  }

  modalDescription.textContent = usedFallback
    ? `Icon / Hero 샘플과 대체 DB 카드 ${availableCards.length}개를 표시합니다.`
    : `Icon / Hero 샘플을 포함해 ${position} 포지션 카드 ${availableCards.length}개를 선택할 수 있습니다.`;
  renderPlayerList(availableCards);
}

function getSelectedCardIds(currentSlotKey) {
  return new Set(
    Object.entries(squad)
      .filter(([slotKey, item]) => slotKey !== currentSlotKey && item?.card_id !== undefined && item.card_id !== null)
      .map(([, item]) => String(item.card_id)),
  );
}

async function fetchCardsForPosition(selectedSlot) {
  const targetPosition = normalizePosition(selectedSlot);
  // 모든 포지션 관계를 먼저 받아 카드별로 합쳐야, 주 포지션에서 고른 카드도
  // 드래그 이후 보조 포지션 정보를 잃지 않습니다.
  const { data: fallbackRows, error: fallbackError } = await supabase
    .from('card_positions')
    .select(PLAYER_CARD_SELECT)
    .limit(500);

  if (fallbackError) return { cards: [], usedFallback: true, error: fallbackError };

  const allCards = normalizePlayerCardRows(fallbackRows ?? []);
  const positionedCards = allCards.filter((card) => [card.position, ...(card.alt_positions ?? [])]
    .some((position) => normalizePosition(position) === targetPosition));
  return positionedCards.length
    ? { cards: positionedCards, usedFallback: false, error: null }
    : { cards: allCards, usedFallback: true, error: null };
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
    overall: cardVersion.overall,
    sm: cardVersion.sm,
    wf: cardVersion.wf,
    price: cardVersion.price,
    club: cardVersion.club,
    league: cardVersion.league,
    image_url: cardVersion.image_url,
    name: player.name,
    nation: player.nation,
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

function renderPlayerList(cards) {
  modalPlayerCards = cards;
  renderFilteredPlayerList();
}

function updateModalPlayerSearch() {
  modalPlayerSearchClear.hidden = !modalPlayerSearchInput.value;
  renderFilteredPlayerList();
}

function renderFilteredPlayerList() {
  const searchTerm = normalizeText(modalPlayerSearchInput.value.trim());
  const filteredCards = searchTerm
    ? modalPlayerCards.filter((card) => [card.name, card.shortName, getCardName(card)]
      .some((name) => normalizeText(name).includes(searchTerm)))
    : modalPlayerCards;

  if (searchTerm && !filteredCards.length) {
    renderMessage('검색 결과와 일치하는 선수가 없습니다.');
    playerList.firstElementChild?.classList.add('search-empty');
    return;
  }

  playerList.replaceChildren();
  filteredCards.forEach((card) => {
    const button = document.createElement('button');
    button.className = 'player-option';
    button.classList.toggle('is-mock-card', Boolean(card.isMock));
    button.type = 'button';
    button.addEventListener('click', () => {
      placeCard(activeSlot, card);
      status.textContent = `${getCardName(card)} 선수를 ${activeSlot.dataset.position} 슬롯에 배치했습니다.`;
      closeModal();
    });

    const image = getCardImage(card);
    if (image) {
      const thumbnail = document.createElement('img');
      thumbnail.className = 'player-thumbnail';
      thumbnail.src = image;
      thumbnail.alt = '';
      thumbnail.loading = 'lazy';
      thumbnail.addEventListener('error', () => thumbnail.remove());
      button.append(thumbnail);
    }

    const details = document.createElement('span');
    details.className = 'player-option-details';
    const name = document.createElement('strong');
    name.textContent = getCardName(card);
    if (card.isMock) {
      const mockBadge = document.createElement('span');
      mockBadge.className = `mock-card-badge ${card.isIcon ? 'is-icon' : 'is-hero'}`;
      mockBadge.textContent = card.isIcon ? 'ICON · CHEM TEST' : 'HERO · CHEM TEST';
      details.append(mockBadge);
    }
    const meta = document.createElement('small');
    meta.textContent = [getCardRating(card), getCardPosition(card), card.nation, card.club]
      .filter(Boolean)
      .join(' · ') || '카드 정보';
    details.append(name, meta);

    const stats = getCardStats(card, true);
    if (stats.length) {
      const statsGrid = document.createElement('span');
      statsGrid.className = 'player-option-stats';
      statsGrid.textContent = stats.join('  ');
      details.append(statsGrid);
    }
    const physicalInfo = document.createElement('small');
    physicalInfo.className = 'player-option-physical-info';
    physicalInfo.textContent = formatPlayerPhysicalInfo(card);
    details.append(physicalInfo);
    details.append(createSkillFootBadges(card));
    details.append(createRoleBadges(card));
    details.append(createPlaystyleBadges(card));
    button.append(details);
    playerList.append(button);
  });
}

function renderMessage(message, isError = false) {
  const text = document.createElement('p');
  text.className = isError ? 'list-message error' : 'list-message';
  text.textContent = message;
  playerList.replaceChildren(text);
}

function closeModal() {
  modal.hidden = true;
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
  slot.classList.remove('occupied', 'is-locked', 'is-out-of-position', 'is-dragging', 'is-drop-target');
  slot.replaceChildren();

  const positionLabel = document.createElement('span');
  positionLabel.textContent = slotKey;
  slot.append(positionLabel);
  if (shouldUpdate) updateSquadChemistry();
}

function placeCard(slot, card, shouldUpdate = true) {
  const name = getCardName(card);
  const rating = getCardRating(card);
  const image = getCardImage(card);
  const chemistryCard = toChemistryPlayerCard(card);
  slot.dataset.card = name;
  slot.dataset.cardId = chemistryCard.id;
  squad[slot.dataset.position] = createSquadEntry(chemistryCard.id, card, chemistryCard);
  slot.draggable = true;
  slot.classList.add('occupied');
  slot.classList.remove('is-locked');
  slot.replaceChildren();

  const cardActions = document.createElement('span');
  cardActions.className = 'slot-card-actions';
  const lockButton = document.createElement('button');
  lockButton.className = 'lock-player';
  lockButton.type = 'button';
  lockButton.addEventListener('click', (event) => handleTogglePlayerLock(event, slot));

  const removeButton = document.createElement('button');
  removeButton.className = 'remove-player';
  removeButton.type = 'button';
  removeButton.setAttribute('aria-label', `${name} 선수 제거`);
  removeButton.textContent = '×';
  removeButton.addEventListener('click', (event) => handleRemovePlayer(event, slot.dataset.position));
  cardActions.append(lockButton, removeButton);
  slot.append(cardActions);
  updateSlotLockUI(slot);

  if (image) {
    const portrait = document.createElement('img');
    portrait.className = 'slot-card-image';
    portrait.src = image;
    portrait.alt = '';
    portrait.addEventListener('error', () => portrait.remove());
    slot.append(portrait);
  }
  const ratingElement = document.createElement('span');
  ratingElement.className = 'card-rating';
  ratingElement.textContent = rating;
  const nameElement = document.createElement('strong');
  nameElement.textContent = name;
  const positionElement = document.createElement('small');
  positionElement.className = 'slot-position';
  positionElement.textContent = slot.dataset.position;
  const stats = getCardStats(card);
  slot.append(ratingElement, nameElement, positionElement);
  if (stats.length) {
    const statsElement = document.createElement('span');
    statsElement.className = 'card-stats';
    statsElement.textContent = stats.join(' · ');
    slot.append(statsElement);
  }
  slot.append(createSkillFootBadges(card, 'slot-skill-foot-badges'));
  slot.append(createRoleBadges(card, 2, 'slot-role-badges'));
  slot.append(createPlaystyleBadges(card, 2, 'slot-playstyles'));
  if (shouldUpdate) updateSquadChemistry();
}

function handleTogglePlayerLock(event, slot) {
  event.stopPropagation();
  const entry = squad[slot.dataset.position];
  if (!entry?.card) return;

  const isLocked = toggleSquadSlotLock(entry);
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
  managerNameInput.value = managerState?.name ?? '';
  managerLeagueSelect.value = managerState?.league ?? '';
  managerNationSelect.value = managerState?.nation ?? '';
  removeManagerButton.hidden = !managerState;
  managerModal.hidden = false;
  requestAnimationFrame(() => (managerState ? managerNameInput : managerLeagueSelect).focus());
}

function closeManagerModal() {
  managerModal.hidden = true;
}

function saveManager(event) {
  event.preventDefault();
  const league = managerLeagueSelect.value;
  const nation = managerNationSelect.value;
  if (!league || !nation) return;
  managerState = { name: managerNameInput.value.trim(), league, nation };
  renderManagerSlot();
  closeManagerModal();
  updateSquadChemistry();
  status.textContent = `${managerState.name || '감독'} 설정을 저장했습니다.`;
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
  });
  return { leagueId: adapted.leagueId, nationId: adapted.nationId };
}

function getNationFlag(nation) {
  return ({ England: '🏴', France: '🇫🇷', Spain: '🇪🇸', Germany: '🇩🇪', Italy: '🇮🇹', Brazil: '🇧🇷' })[nation] ?? '⚑';
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
  nation.className = 'manager-affiliation';
  nation.textContent = `${getNationFlag(managerState.nation)} ${managerState.nation}`;
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

  if (!originSlot || !originCard || originPosition === targetPosition
    || isSquadSlotLocked(squad[originPosition]) || isSquadSlotLocked(squad[targetPosition])) {
    clearSlotDragFeedback();
    return;
  }

  const targetCard = squad[targetPosition]?.card ?? null;
  placeCard(targetSlot, originCard, false);
  if (targetCard) {
    placeCard(originSlot, targetCard, false);
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
  totalCostOutput.value = new Intl.NumberFormat('en-US').format(getSquadTotalCost());
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
    slot.append(badge);
  });
}

function getSquadTotalCost() {
  return Object.values(squad).reduce((total, entry) => {
    if (!entry?.card) return total;
    const rawPrice = entry.card.price ?? entry.card.cost ?? 0;
    const price = Number(String(rawPrice).replace(/[^\d.-]/g, ''));
    return total + (Number.isFinite(price) && price > 0 ? price : 0);
  }, 0);
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
  const counts = new Map();
  const names = new Map();
  const cards = new Map();

  function add(key, amount, name, card) {
    counts.set(key, (counts.get(key) ?? 0) + amount);
    if (!names.has(key)) names.set(key, name);
    if (!cards.has(key)) cards.set(key, card);
  }

  const inPositionCards = [...document.querySelectorAll('.slot')]
    .map((slot) => ({ slot, card: squad[slot.dataset.position]?.card }))
    .filter(({ slot, card }) => card && isCardInSlotPosition(card, slot.dataset.position));

  if (group.key === 'league') {
    const iconCount = inPositionCards.filter(({ card }) => card.isIcon).length;
    const represented = new Map();
    inPositionCards.forEach(({ card }) => {
      const player = toChemistryPlayerCard(card);
      if (card.isIcon) return;
      const name = getChemistryEntityName(card, 'league');
      const key = getChemistryEntityKey(card, 'league', player.leagueId);
      represented.set(key, name);
      add(key, card.isHero ? 2 : 1, name, card);
    });
    represented.forEach((name, key) => add(key, iconCount, name, cards.get(key)));
    if (iconCount) {
      counts.set('league:icon-bonus', iconCount);
      names.set('league:icon-bonus', 'Icons');
    }
  } else {
    inPositionCards.forEach(({ card }) => {
      const player = toChemistryPlayerCard(card);
      if (group.key === 'club') {
        if (!card.isIcon && !card.isHero) {
          add(getChemistryEntityKey(card, 'club', player.clubId), 1, getChemistryEntityName(card, 'club'), card);
        }
      } else {
        add(getChemistryEntityKey(card, 'nation', player.nationId), card.isIcon ? 2 : 1, getChemistryEntityName(card, 'nation'), card);
      }
    });
  }

  if (managerState && (group.key === 'league' || group.key === 'nation')) {
    const name = managerState[group.key];
    const key = getChemistryEntityKey({ [group.key]: name }, group.key, name);
    add(key, 1, name, null);
  }

  return [...counts.entries()]
    .map(([id, count]) => ({ id, count, name: names.get(id), logo: getChemistryEntityLogo(cards.get(id), group.key), isIconBonus: id === 'league:icon-bonus', level: group.thresholds.filter((threshold) => count >= threshold).length }))
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
  const namedField = ['name', 'player_name', 'card_name', 'display_name'].find(
    (field) => typeof card[field] === 'string' && card[field].trim(),
  );
  return namedField ? card[namedField] : '이름 없는 선수';
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
