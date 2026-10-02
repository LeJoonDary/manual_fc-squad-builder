import { renderDetailStatGroups } from '../utils/detailStats.js';
import { getCardBackground } from '../utils/cardBackground.js';
import { loadPlayerDetail } from '../utils/playerCatalog.js';

// Existing detail panel shared by the Players and Squad Builder tabs.
export function createPlayerDetailModal({
  supabase, normalizeBrowserPlayerCard, asArray, getCardImage, getCardRating,
  getCardName, getPlayStyles, createPlaystyleBadges, getRoles, unwrapRelation,
}) {
  const playerDetailModal = document.querySelector('#player-detail-modal');
  const playerDetailIdentity = document.querySelector('#player-detail-identity');
  const playerDetailBio = document.querySelector('#player-detail-bio');
  const playerDetailStats = document.querySelector('#player-detail-stats');
  const playerDetailRoles = document.querySelector('#player-detail-roles');
  const playerDetailPlaystyles = document.querySelector('#player-detail-playstyles');
  let selectedPlayer = null;
  let playerDetailRequest = 0;
  let returnFocus = null;
  async function openPlayerDetailModal(card) {
    if (playerDetailModal.hidden) returnFocus = document.activeElement;
    const requestId = ++playerDetailRequest;
    selectedPlayer = card;
    renderPlayerDetail(card);
    playerDetailModal.hidden = false;
    document.querySelector('#player-detail-close').focus();

    if (!supabase) return;

    let cardDetail;
    try {
      cardDetail = await loadPlayerDetail(supabase, card.id);
    } catch {
      if (requestId === playerDetailRequest) playerDetailStats.textContent = 'Unable to load player details. Please reopen the panel.';
      return;
    }
    if (requestId !== playerDetailRequest || selectedPlayer?.id !== card.id) return;

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
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }

  function renderPlayerDetail(card) {
    const positions = [card.primary_position, ...(card.secondary_positions ?? [])].filter(Boolean);
    playerDetailIdentity.replaceChildren();
    const image = getCardImage(card);
    const background = getCardBackground(card);
    const artwork = document.createElement('div');
    artwork.className = 'player-detail-artwork';
    if (background) artwork.style.backgroundImage = `url(${JSON.stringify(background)})`;
    if (image) {
      const portrait = document.createElement('img');
      portrait.className = 'player-detail-image';
      portrait.src = image;
      portrait.alt = '';
      portrait.addEventListener('error', () => portrait.remove());
      artwork.append(portrait);
    }
    if (background || image) playerDetailIdentity.append(artwork);
    const heading = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = [getCardRating(card), positions.join(' / ')].filter(Boolean).join(' · ');
    const name = document.createElement('h1');
    name.id = 'player-detail-name';
    name.textContent = getCardName(card);
    const meta = document.createElement('p');
    meta.className = 'player-detail-meta';
    meta.textContent = [card.club, card.nation].filter(Boolean).join(' · ') || 'Affiliation details unavailable';
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
      playerDetailPlaystyles.textContent = 'No PlayStyles available.';
      if (import.meta.env.DEV) console.log('[PlayerDetail] PlayStyles raw player data:', card.raw ?? card);
    }
  }

  function renderDetailRoles(card) {
    playerDetailRoles.replaceChildren();
    const roles = getRoles(card)
      .sort((left, right) => left.position.localeCompare(right.position) || left.name.localeCompare(right.name) || right.level - left.level);

    if (!roles.length) {
      playerDetailRoles.textContent = 'No roles available.';
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
    const player = unwrapRelation(card.raw?.players);
    const nation = unwrapRelation(player?.nations);
    const nationTile = createDetailValue('Nation', nation?.name ?? card.nation ?? '-');
    const nationValue = nationTile.querySelector('strong');
    nationValue.classList.add('detail-nation-value');
    if (typeof nation?.flag_url === 'string' && nation.flag_url.trim()) {
      const flag = document.createElement('img');
      flag.src = nation.flag_url;
      flag.alt = '';
      flag.addEventListener('error', () => flag.remove());
      nationValue.prepend(flag);
    }
    const specs = [
      ['League', card.league ?? '-'],
      ['Club', card.club ?? '-'],
      ['Card Version', card.version ?? '-'],
      ['Height', card.height === undefined || card.height === null ? '-' : `${card.height}cm`],
      ['Weight', card.weight === undefined || card.weight === null ? '-' : `${card.weight}kg`],
      ['Age', card.age === undefined || card.age === null ? '-' : `${card.age} yrs`],
      ['Gender', card.gender ?? '-'],
      ['Preferred Foot', card.preferred_foot ?? '-'],
      ['Skill Moves', card.sm === undefined || card.sm === null ? '-' : `${card.sm}★`],
      ['Weak Foot', card.wf === undefined || card.wf === null ? '-' : `${card.wf}★`],
      ['Accele Type', card.accele_type ?? '-'],
      ['Body Type', card.body_type ?? '-'],
    ];
    playerDetailBio.replaceChildren(nationTile, ...specs.map(([label, value]) => createDetailValue(label, value)));
  }

  function renderDetailStats(card) {
    renderDetailStatGroups(playerDetailStats, card);
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

  playerDetailModal.querySelectorAll('[data-close-detail-modal]').forEach((button) => {
    button.addEventListener('click', closePlayerDetailModal);
  });
  return {
    open: openPlayerDetailModal,
    close: closePlayerDetailModal,
    destroy() { closePlayerDetailModal(); },
    get isOpen() { return !playerDetailModal.hidden; },
  };
}
