import { renderDetailStatGroups } from '../utils/detailStats.js';
import { getCardBackground } from '../utils/cardBackground.js';
import { loadPlayerDetail } from '../utils/playerCatalog.js';
import { formatCardVersion } from '../utils/pitchCardLabels.js';
import { createPlaystyleIcons } from './PlaystyleIcons.js';

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
  let review = null;
  const reviewDialog = document.createElement('dialog');
  reviewDialog.className = 'youtube-review-dialog';
  reviewDialog.setAttribute('aria-label', 'Gameplay Review');
  reviewDialog.innerHTML = '<button type="button" class="youtube-review-close" aria-label="Close review">×</button><div class="youtube-review-video"></div>';
  document.body.append(reviewDialog);
  function closeReview() {
    if (reviewDialog.open) reviewDialog.close();
    reviewDialog.querySelector('.youtube-review-video').replaceChildren();
  }
  reviewDialog.querySelector('button').addEventListener('click', closeReview);
  reviewDialog.addEventListener('close', () => reviewDialog.querySelector('.youtube-review-video').replaceChildren());
  reviewDialog.addEventListener('cancel', event => { event.preventDefault(); closeReview(); });
  reviewDialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); closeReview(); }
  });
  reviewDialog.addEventListener('click', event => { if (event.target === reviewDialog) closeReview(); });
  function openReview(selectedReview = review) {
    if (!selectedReview || !/^[\w-]{11}$/.test(selectedReview.youtube_video_id)) return;
    const frame = document.createElement('iframe');
    frame.src = `https://www.youtube.com/embed/${selectedReview.youtube_video_id}?autoplay=1`;
    frame.title = selectedReview.title || 'Gameplay Review';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    reviewDialog.querySelector('.youtube-review-video').replaceChildren(frame);
    reviewDialog.showModal();
    reviewDialog.querySelector('button').focus();
  }
  async function loadReview(card, requestId) {
    try {
      const { data, error } = await supabase.from('card_reviews')
        .select('youtube_video_id,title').eq('card_id', card.id).maybeSingle();
      if (error || requestId !== playerDetailRequest || !data || !/^[\w-]{11}$/.test(data.youtube_video_id)) return;
      review = data;
      const button = playerDetailIdentity.querySelector('.youtube-review-button');
      if (button) button.hidden = false;
    } catch { /* Reviews are optional; player details remain usable. */ }
  }
  async function openPlayerDetailModal(card) {
    closeReview();
    review = null;
    if (playerDetailModal.hidden) returnFocus = document.activeElement;
    const requestId = ++playerDetailRequest;
    selectedPlayer = card;
    renderPlayerDetail(card);
    playerDetailModal.hidden = false;
    playerDetailModal.querySelector('.player-detail-panel').scrollTop = 0;
    document.querySelector('#player-detail-close').focus();

    if (!supabase) return;
    const reviewRequest = loadReview(card, requestId);

    let cardDetail;
    try {
      cardDetail = await loadPlayerDetail(supabase, card.id);
    } catch {
      if (requestId === playerDetailRequest) playerDetailStats.textContent = 'Unable to load player details. Please reopen the panel.';
      await reviewRequest;
      return;
    }
    await reviewRequest;
    if (requestId !== playerDetailRequest || selectedPlayer?.id !== card.id) return;

    const detailedCard = normalizeBrowserPlayerCard(cardDetail);
    if (!detailedCard) return;
    // Nested Join 결과를 그대로 보존해 Roles 렌더러가 card_roles 배열을 항상 참조하도록 합니다.
    detailedCard.card_roles = asArray(cardDetail.card_roles);
    selectedPlayer = detailedCard;
    renderPlayerDetail(detailedCard);
  }

  function closePlayerDetailModal() {
    closeReview();
    review = null;
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
    heading.className = 'player-detail-heading';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = [getCardRating(card), positions.join(' / ')].filter(Boolean).join(' · ');
    const name = document.createElement('h1');
    name.id = 'player-detail-name';
    name.textContent = getCardName(card);
    const meta = document.createElement('p');
    meta.className = 'player-detail-meta';
    meta.textContent = [card.club, card.nation].filter(Boolean).join(' · ') || 'Affiliation details unavailable';
    const nameRow = document.createElement('div');
    nameRow.className = 'player-detail-name-row';
    const reviewButton = document.createElement('button');
    reviewButton.type = 'button';
    reviewButton.className = 'youtube-review-button';
    reviewButton.textContent = '▶ Gameplay Review';
    reviewButton.hidden = !review;
    reviewButton.addEventListener('click', () => openReview());
    nameRow.append(name, reviewButton);
    heading.append(eyebrow, nameRow, meta);
    playerDetailIdentity.append(heading);

    renderDetailSpecs(card);
    renderDetailStats(card);
    renderDetailRoles(card);
    const detailPlaystyles = getPlayStyles(card);
    playerDetailPlaystyles.replaceChildren(
      createPlaystyleIcons(detailPlaystyles, 'detail-playstyle-icons'),
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

    const groups = new Map();
    roles.forEach((role) => {
      if (!groups.has(role.position)) {
        const row = document.createElement('div');
        row.className = 'detail-role-group';
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', `${role.position} roles`);
        const position = document.createElement('span');
        position.className = 'detail-role-position';
        position.textContent = role.position;
        const badges = document.createElement('div');
        badges.className = 'detail-role-items';
        row.append(position, badges);
        playerDetailRoles.append(row);
        groups.set(role.position, badges);
      }
      const badge = document.createElement('span');
      badge.className = role.level === 2 ? 'detail-role-badge is-plus-plus' : 'detail-role-badge is-plus';
      badge.textContent = `${role.name} ${role.level === 2 ? '++' : '+'}`;
      groups.get(role.position).append(badge);
    });
  }

  function renderDetailSpecs(card) {
    const player = unwrapRelation(card.raw?.players);
    const nation = unwrapRelation(player?.nations);
    const nationTile = createDetailValue('Nation', nation?.name ?? card.nation ?? '-');
    const nationValue = nationTile.querySelector('strong');
    nationValue.classList.add('detail-nation-value');
    const nationName = document.createElement('span');
    nationName.className = 'detail-nation-name';
    nationName.textContent = nationValue.textContent;
    nationValue.replaceChildren(nationName);
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
      ['Skill Moves', card.sm == null ? '—' : `${card.sm}★`],
      ['Weak Foot', card.wf == null ? '—' : `${card.wf}★`],
      ['Card Version', formatCardVersion(card.version).toUpperCase()],
      ['Height / Weight', `${card.height == null ? '—' : `${card.height}cm`} / ${card.weight == null ? '—' : `${card.weight}kg`}`],
      ['Accele Type', card.accele_type || '—'],
      ['Body Type', card.body_type || '—'],
      ['Foot', card.preferred_foot || '—'],
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
    valueElement.title = value;
    if (label === 'Card Version') valueElement.className = 'detail-card-ribbon';
    if (label === 'Skill Moves' || label === 'Weak Foot') valueElement.className = 'detail-star-rating';
    item.append(labelElement, valueElement);
    return item;
  }

  playerDetailModal.querySelectorAll('[data-close-detail-modal]').forEach((button) => {
    button.addEventListener('click', closePlayerDetailModal);
  });
  return {
    openReview,
    open: openPlayerDetailModal,
    close: closePlayerDetailModal,
    destroy() { closePlayerDetailModal(); reviewDialog.remove(); },
    get isOpen() { return !playerDetailModal.hidden; },
  };
}
