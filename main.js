import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const status = document.querySelector('#status');
const modal = document.querySelector('#player-modal');
const modalTitle = document.querySelector('#modal-title');
const modalDescription = document.querySelector('#modal-description');
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
const playerGrid = document.querySelector('#players-grid');
const playerResultCount = document.querySelector('#players-result-count');
const filtersToggle = document.querySelector('#filters-toggle');
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
const playerFilters = {
  name: '', minOvr: '', maxOvr: '', minSm: null, minWf: null, positions: new Set(), onlyPrimary: false, hasAllPositions: false,
  selectedPlayStyles: [], requireAllPlaystyles: false, minPlaystyles: '', maxPlaystyles: '', minPlaystylesPlus: '', maxPlaystylesPlus: '',
  selectedRoles: [], hasAllRoles: false,
  acceleTypes: new Set(), preferredFoot: '', gender: '', bodyTypes: new Set(),
  minHeight: '', maxHeight: '', minWeight: '', maxWeight: '', minAge: '', maxAge: '',
};
const filterAccordionState = { ovr: true, positions: true, 'sm-wf': true, playstyles: true, roles: false, miscellaneous: false };
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
let selectedPlayer = null;
const squad = {};

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
  slot.addEventListener('click', () => openPlayerModal(slot));
});

tabButtons.forEach((button) => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});

playerNameSearch.addEventListener('input', (event) => {
  playerFilters.name = event.target.value.trim();
  schedulePlayerSearch();
});

[minOvrInput, maxOvrInput].forEach((input) => {
  input.addEventListener('input', (event) => {
    playerFilters[input === minOvrInput ? 'minOvr' : 'maxOvr'] = event.target.value;
    schedulePlayerSearch();
  });
});

document.querySelectorAll('[data-position-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    const position = button.dataset.positionFilter;
    playerFilters.positions.has(position)
      ? playerFilters.positions.delete(position)
      : playerFilters.positions.add(position);
    button.classList.toggle('is-selected', playerFilters.positions.has(position));
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
  button.addEventListener('click', () => toggleFilterAccordion(button.dataset.filterAccordion));
});

filtersToggle.addEventListener('click', () => {
  const isExpanded = filtersToggle.getAttribute('aria-expanded') === 'true';
  filtersToggle.setAttribute('aria-expanded', String(!isExpanded));
  filtersToggle.textContent = isExpanded ? '펼치기' : '접기';
  filtersContent.hidden = isExpanded;
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

function toggleFilterAccordion(section) {
  filterAccordionState[section] = !filterAccordionState[section];
  const accordion = document.querySelector(`[data-filter-section="${section}"]`);
  const button = accordion.querySelector('[data-filter-accordion]');
  accordion.classList.toggle('is-closed', !filterAccordionState[section]);
  button.setAttribute('aria-expanded', String(filterAccordionState[section]));
}

async function searchPlayers(scrollPositions = capturePlayerPanelScrollPositions()) {
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

function renderRoleFilterRows() {
  roleFilterList.replaceChildren();
  ROLE_DATA.forEach(({ pos, roles }) => {
    const group = document.createElement('section');
    group.className = 'role-filter-group';
    const heading = document.createElement('h3');
    heading.textContent = pos;
    group.append(heading);
    roles.forEach((roleName) => {
      [1, 2].forEach((level) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = level === 2 ? 'role-filter-row is-plus-plus' : 'role-filter-row is-plus';
        const isSelected = isRoleSelected(pos, roleName, level);
        row.classList.toggle('is-selected', isSelected);
        row.setAttribute('aria-pressed', String(isSelected));
        const label = document.createElement('span');
        label.textContent = `${pos} ${roleName}`;
        const badge = document.createElement('strong');
        badge.textContent = level === 2 ? '++' : '+';
        const indicator = document.createElement('span');
        indicator.className = 'role-filter-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        row.append(label, badge, indicator);
        row.addEventListener('click', () => {
          toggleRoleFilter(pos, roleName, level);
          row.classList.toggle('is-selected', isRoleSelected(pos, roleName, level));
          row.setAttribute('aria-pressed', String(isRoleSelected(pos, roleName, level)));
          searchPlayers();
        });
        group.append(row);
      });
    });
    roleFilterList.append(group);
  });
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
      return role?.position === selectedRole.position
        && role?.role_name === selectedRole.name
        && Number(cardRole.role_level) === selectedRole.level;
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

    return (Array.isArray(data) ? data : [])
      .filter((role) => role && selectedRoles.some(
        (selectedRole) => selectedRole?.position === role.position && selectedRole?.name === role.role_name,
      ))
      .map((role) => role.id)
      .filter((roleId) => roleId !== null && roleId !== undefined);
  } catch (error) {
    console.error('Role ID lookup error:', error);
    return [];
  }
}

async function getMatchedCardIds(selectedRoleIds, hasAllRoles) {
  if (!Array.isArray(selectedRoleIds) || !selectedRoleIds.length) return [];

  try {
    const { data, error } = await supabase
      .from('card_roles')
      .select('card_id, role_id')
      .in('role_id', selectedRoleIds);
    if (error) throw error;

    const safeRoles = Array.isArray(data) ? data.filter(Boolean) : [];
    if (!hasAllRoles) {
      return [...new Set(safeRoles.map((item) => item?.card_id).filter((cardId) => cardId !== null && cardId !== undefined))];
    }

    const requiredRoleIds = new Set(selectedRoleIds.map(String));
    const cardRoleIds = new Map();
    safeRoles.forEach((item) => {
      if (item?.card_id === null || item?.card_id === undefined || item?.role_id === null || item?.role_id === undefined) return;
      const cardId = String(item.card_id);
      if (!cardRoleIds.has(cardId)) cardRoleIds.set(cardId, new Set());
      cardRoleIds.get(cardId).add(String(item.role_id));
    });

    return [...cardRoleIds]
      .filter(([, roleIds]) => [...requiredRoleIds].every((roleId) => roleIds.has(roleId)))
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

  playerNameSearch.value = '';
  minOvrInput.value = '';
  maxOvrInput.value = '';
  onlyPrimaryPositions.checked = false;
  hasAllSelectedPositions.checked = false;
  requireAllPlaystyles.checked = false;
  minPlaystylesInput.value = '';
  maxPlaystylesInput.value = '';
  minPlaystylesPlusInput.value = '';
  maxPlaystylesPlusInput.value = '';
  hasAllSelectedRoles.checked = false;
  [minHeightInput, maxHeightInput, minWeightInput, maxWeightInput, minAgeInput, maxAgeInput].forEach((input) => { input.value = ''; });
  document.querySelectorAll('[data-position-filter]').forEach((button) => button.classList.remove('is-selected'));
  document.querySelectorAll('[data-rating-filter]').forEach((button) => button.classList.remove('is-selected'));
  document.querySelectorAll('[data-misc-filter]').forEach((button) => button.classList.remove('is-selected'));
  document.querySelectorAll('.playstyle-filter-button').forEach((button) => {
    button.classList.remove('is-selected');
    button.setAttribute('aria-pressed', 'false');
  });
  renderRoleFilterRows();
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
  playerDetailPlaystyles.replaceChildren(createPlaystyleBadges(card, Infinity, 'detail-playstyle-badges playstyle-badges'));
  if (!card.playstyles?.length) playerDetailPlaystyles.textContent = '등록된 특성이 없습니다.';
}

function renderDetailRoles(card) {
  playerDetailRoles.replaceChildren();
  const roles = (card.card_roles ?? [])
    .map((cardRole) => {
      const role = unwrapRelation(cardRole.roles);
      const level = Number(cardRole.role_level);
      if (!role?.position || !role?.role_name || ![1, 2].includes(level)) return null;
      return { position: role.position, name: role.role_name, level };
    })
    .filter(Boolean)
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
  activeSlot = slot;
  const position = slot.dataset.position;
  modal.hidden = false;
  modalTitle.textContent = `${position} 선수 선택`;
  modalDescription.textContent = `${position} 포지션 카드를 불러오는 중…`;
  renderMessage('선수 목록을 불러오는 중입니다…');

  if (!supabase) {
    modalDescription.textContent = 'Supabase 연결 정보가 설정되지 않았습니다.';
    renderMessage('VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 설정한 뒤 다시 시도하세요.', true);
    return;
  }

  const { cards, usedFallback, error } = await fetchCardsForPosition(position);
  if (error) {
    modalDescription.textContent = '선수 정보를 불러오지 못했습니다.';
    renderMessage(error.message, true);
    return;
  }

  if (!cards.length) {
    modalDescription.textContent = `${position}에 배치할 선수가 없습니다.`;
    renderMessage('card_versions 테이블에 카드가 있는지 확인하세요.', true);
    return;
  }

  const selectedCardIds = getSelectedCardIds(position);
  const availableCards = cards.filter((card) => !selectedCardIds.has(String(card.id)));
  if (!availableCards.length) {
    modalDescription.textContent = `${position}에 배치할 수 있는 카드가 없습니다.`;
    renderMessage('조회된 모든 카드가 이미 다른 스쿼드 슬롯에 배치되어 있습니다.');
    return;
  }

  modalDescription.textContent = usedFallback
    ? `포지션 전용 결과가 없어 중복을 제외한 카드 ${availableCards.length}개를 표시합니다. 원하는 선수를 선택하세요.`
    : `${position} 포지션 카드 ${availableCards.length}개를 선택할 수 있습니다.`;
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
  // 포지션은 card_positions에 정규화되어 있으므로, 조인한 positions.name으로 필터링합니다.
  const { data: positionRows, error: positionError } = await supabase
    .from('card_positions')
    .select(PLAYER_CARD_SELECT)
    .eq('positions.name', targetPosition)
    .limit(100);

  const positionedCards = (positionRows ?? []).map(normalizePlayerCard).filter(Boolean);
  if (!positionError && positionedCards.length) {
    return { cards: positionedCards, usedFallback: false, error: null };
  }

  // 포지션 관계가 없거나 데이터가 비어 있는 카드는 전체 목록에서 선택할 수 있도록 대체합니다.
  const { data: fallbackRows, error: fallbackError } = await supabase
    .from('card_positions')
    .select(PLAYER_CARD_SELECT)
    .limit(500);

  if (fallbackError) return { cards: [], usedFallback: true, error: fallbackError };

  const fallbackCards = fallbackRows.map(normalizePlayerCard).filter(Boolean);
  return { cards: fallbackCards, usedFallback: true, error: null };
}

function normalizePosition(slot) {
  const positionMap = {
    LCB: 'CB', RCB: 'CB',
    LCM: 'CM', RCM: 'CM',
    LDM: 'CDM', RDM: 'CDM',
    LAM: 'CAM', RAM: 'CAM',
    LS: 'ST', RS: 'ST',
    LF: 'CF', RF: 'CF',
  };
  return positionMap[slot] || slot;
}

function normalizePlayerCard(row) {
  const cardVersion = unwrapRelation(row.card_versions);
  if (!cardVersion) return null;

  const player = unwrapRelation(cardVersion.players) ?? {};
  const stats = unwrapRelation(cardVersion.player_stats) ?? {};
  const position = unwrapRelation(row.positions) ?? {};
  const playstyles = asArray(cardVersion.card_playstyles).flatMap((cardPlaystyle) => {
    const playstyle = unwrapRelation(cardPlaystyle.playstyles);
    return playstyle?.name ? [{ name: playstyle.name, isPlus: Boolean(cardPlaystyle.is_plus) }] : [];
  });

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
    // card_roles는 Supabase가 배열로 반환합니다. 렌더링 시 이 원본 배열을 직접 순회합니다.
    card_roles: asArray(cardVersion.card_roles),
  };
}

function unwrapRelation(value) {
  return Array.isArray(value) ? value[0] : value;
}

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function renderPlayerList(cards) {
  playerList.replaceChildren();
  cards.forEach((card) => {
    const button = document.createElement('button');
    button.className = 'player-option';
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
}

function handleRemovePlayer(event, slotKey) {
  event.stopPropagation();
  const slot = document.querySelector(`.slot[data-position="${slotKey}"]`);
  if (!slot) return;

  squad[slotKey] = null;
  delete slot.dataset.card;
  delete slot.dataset.cardId;
  slot.classList.remove('occupied');
  slot.replaceChildren();

  const positionLabel = document.createElement('span');
  positionLabel.textContent = slotKey;
  slot.append(positionLabel);
  status.textContent = `${slotKey} 슬롯에서 선수를 제거했습니다.`;
}

function placeCard(slot, card) {
  const name = getCardName(card);
  const rating = getCardRating(card);
  const image = getCardImage(card);
  slot.dataset.card = name;
  slot.dataset.cardId = card.id ?? '';
  squad[slot.dataset.position] = { card_id: card.id, card };
  slot.classList.add('occupied');
  slot.replaceChildren();

  const removeButton = document.createElement('button');
  removeButton.className = 'remove-player';
  removeButton.type = 'button';
  removeButton.setAttribute('aria-label', `${name} 선수 제거`);
  removeButton.textContent = '×';
  removeButton.addEventListener('click', (event) => handleRemovePlayer(event, slot.dataset.position));
  slot.append(removeButton);

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
  const playstyles = card.playstyles ?? [];

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
