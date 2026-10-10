import { getCardFaceStats } from '../utils/cardFaceStats.js';
import { getCardBackground } from '../utils/cardBackground.js';

// Shared DOM card component for the Players tab and selection modal.
export function createPlayerCard(card, {
  onActivate, onShowDetails = onActivate, actionLabel = 'View player details', textAffiliations = false,
  getCardName, getCardRating, getCardPosition, getChemistryEntityLogo,
  createPlaystyleBadges, unwrapRelation, affiliationCatalog, createReviewButton,
}) {
  const article = document.createElement('article');
  article.className = 'browser-player-card rounded-xl overflow-hidden shadow-md border border-slate-700/50 flex flex-col w-full';
  article.tabIndex = 0;
  article.setAttribute('role', 'button');
  article.setAttribute('aria-label', `${getCardName(card)} ${actionLabel}`);
  article.addEventListener('click', () => onActivate(card));
  article.addEventListener('keydown', (event) => {
    if (event.target !== article) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate(card);
    }
  });
  const content = document.createElement('div');
  content.className = 'browser-player-content w-full bg-cover bg-top bg-no-repeat relative p-3';
  const backgroundUrl = getCardBackground(card);
  article.classList.toggle('has-card-background', Boolean(backgroundUrl));
  if (backgroundUrl) {
    const background = document.createElement('img');
    background.className = 'browser-player-background';
    background.src = backgroundUrl;
    background.alt = '';
    background.draggable = false;
    background.addEventListener('error', () => background.remove());
    article.append(background);
  }
  const tint = document.createElement('div');
  tint.className = 'browser-player-tint';
  tint.setAttribute('aria-hidden', 'true');
  article.append(tint);
  const gradient = document.createElement('div');
  gradient.className = 'browser-player-gradient';
  gradient.setAttribute('aria-hidden', 'true');
  article.append(gradient);
  const identity = document.createElement('div');
  identity.className = 'browser-player-identity';
  const rating = document.createElement('span');
  rating.className = 'browser-player-rating';
  rating.textContent = getCardRating(card) || '-';
  const name = document.createElement('h3');
  name.textContent = getCardName(card);
  name.title = getCardName(card);
  identity.append(rating, name);
  const affiliations = document.createElement('div');
  affiliations.className = 'browser-player-affiliations';
  if (card.nation_flag_url) {
    const flag = document.createElement('img');
    flag.className = 'browser-player-flag';
    flag.src = card.nation_flag_url;
    flag.alt = card.nation ? `${card.nation} flag` : 'flag';
    flag.title = card.nation ?? '';
    flag.width = 24;
    flag.loading = 'lazy';
    flag.addEventListener('error', () => flag.remove());
    affiliations.append(flag);
  }
  for (const key of ['league', 'club']) {
    const relation = unwrapRelation(card.raw?.[`${key}s`] ?? card[`${key}s`]);
    const entity = affiliationCatalog[`${key}s`]?.find(row => String(row.id) === String(card[`${key}_id`] ?? relation?.id));
    const fullName = (typeof card[key] === 'string' ? card[key] : card[key]?.name) || relation?.name || entity?.name;
    const shortName = card[`${key}_short_name`] || entity?.short_name;
    const clubRelation = unwrapRelation(card.raw?.clubs ?? card.clubs);
    const isIcon = /icon/i.test(fullName ?? '')
      || String(card.club_id ?? card.club?.id ?? clubRelation?.id) === '112658';
    if (!shortName && !fullName && !isIcon) continue;
    const label = document.createElement('span');
    label.textContent = shortName || fullName || '';
    label.title = fullName ?? shortName ?? '';
    if (isIcon) {
      label.className = 'browser-player-icon-emblem';
      label.title = 'ICON';
      label.setAttribute('role', 'img');
      label.setAttribute('aria-label', 'ICON');
      label.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2 21 5v7c0 5-5 8-9 10-4-2-9-5-9-10V5Z" fill="currentColor" fill-opacity=".05" stroke="currentColor" stroke-width="1.5"/><path d="m12 6 1.6 3.3 3.7.5-2.7 2.6.6 3.6-3.2-1.7L8.8 16l.6-3.6-2.7-2.6 3.7-.5Z" fill="currentColor"/></svg>';
    }
    affiliations.append(label);
  }
  const footer = document.createElement('div');
  footer.className = 'browser-player-footer w-full p-2.5 flex flex-col font-bold';
  const positions = document.createElement('div');
  positions.className = 'browser-player-positions';
  const position = document.createElement('strong');
  position.className = 'browser-player-position bg-slate-950/80 text-amber-300 border border-amber-400/80 font-bold';
  position.textContent = card.primary_position || getCardPosition(card) || '-';
  position.title = 'Primary Position';
  positions.append(position);
  const secondaryPositions = [...new Set(card.secondary_positions ?? card.alt_positions ?? [])]
    .filter(value => value && value !== position.textContent);
  for (const secondary of secondaryPositions.slice(0, 2)) {
    const badge = document.createElement('span');
    badge.className = 'browser-player-secondary-position bg-slate-900/60 text-slate-200 border border-slate-600/60';
    badge.textContent = secondary;
    badge.title = 'Alternate Position';
    positions.append(badge);
  }
  if (secondaryPositions.length > 2) {
    const more = document.createElement('span');
    more.className = 'browser-player-secondary-position';
    more.textContent = `+${secondaryPositions.length - 2}`;
    more.title = secondaryPositions.slice(2).join(', ');
    positions.append(more);
  }
  let score;
  if (!card.summary_only) {
    score = document.createElement('div');
    score.className = 'browser-player-meta-score bg-slate-950/85 text-emerald-400 border border-emerald-500/50 font-extrabold px-2 py-0.5 rounded-md';
    score.textContent = card.meta_score == null ? '[Meta Score: N/A]' : `[Meta Score: ${card.meta_score.toFixed(1)}]`;
    score.title = card.score_position ? `${card.score_position} · Excludes 3-back adjustments` : 'Position weights are not available yet.';
  }
  const affiliationRow = document.createElement('div');
  affiliationRow.className = 'browser-player-affiliation-row';
  affiliationRow.append(affiliations);
  if (createReviewButton) affiliationRow.append(createReviewButton(card));
  const positionRow = document.createElement('div');
  positionRow.className = 'browser-player-position-row';
  positionRow.append(positions);
  if (card.version && card.version.toLowerCase() !== 'card') {
    const version = document.createElement('span');
    version.className = 'browser-player-version';
    version.textContent = card.version.replace(/^special_/i, '').replace(/_/g, ' ');
    version.title = version.textContent;
    positionRow.append(version);
  }
  content.append(identity, positionRow, affiliationRow);
  if (score) content.append(score);
  const player = unwrapRelation(card.raw?.players) ?? {};
  const height = card.height ?? player.height;
  const weight = card.weight ?? player.weight;
  const validMeasurement = value => (typeof value === 'number' || typeof value === 'string')
    && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
  if (validMeasurement(height) && validMeasurement(weight)) {
    const physical = document.createElement('p');
    physical.className = 'browser-player-physical';
    const bodyType = card.body_type ?? card.raw?.body_type;
    physical.textContent = `${Number(height)}cm · ${Number(weight)}kg${
      typeof bodyType === 'string' && bodyType.trim() ? ` | ${bodyType.trim()}` : ''}`;
    content.append(physical);
  }
  const roleRows = card.card_roles ?? card.raw?.card_roles;
  const eliteRoles = new Map();
  for (const row of Array.isArray(roleRows) ? roleRows : []) {
    if (!row) continue;
    const role = unwrapRelation(row.roles);
    if (typeof role?.role_name !== 'string' || !role.role_name.trim()) continue;
    const name = role.role_name.trim().replace(/\+{1,2}$/, '').trim();
    const position = typeof role.position === 'string' ? role.position.trim() : '';
    const level = row.role_level === '++' ? 2 : row.role_level === '+' ? 1 : Number(row.role_level) || 0;
    const key = `${position}|${name}`;
    if (!eliteRoles.has(key) || eliteRoles.get(key).level < level) {
      eliteRoles.set(key, { name, position, level });
    }
  }
  if (eliteRoles.size) {
    const roles = document.createElement('div');
    roles.className = 'browser-player-elite-roles';
    const ranked = [...eliteRoles.values()].sort((a, b) => b.level - a.level
      || Number(b.position === card.primary_position) - Number(a.position === card.primary_position));
    for (const role of ranked.slice(0, 2)) {
      const badge = document.createElement('span');
      badge.textContent = `${role.position ? `${role.position} · ` : ''}${role.name}${role.level >= 2 ? '++' : role.level === 1 ? '+' : ''}`;
      badge.title = badge.textContent;
      roles.append(badge);
    }
    if (ranked.length > 2) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'browser-player-roles-more';
      more.textContent = `+${ranked.length - 2}`;
      more.title = 'View all roles in player details';
      more.setAttribute('aria-label', `${ranked.length - 2} more roles · View all roles`);
      more.addEventListener('click', event => {
        event.stopPropagation();
        onShowDetails(card);
      });
      more.addEventListener('keydown', event => event.stopPropagation());
      roles.append(more);
    }
    content.append(roles);
  }
  content.append(createPlaystyleBadges(card, Infinity, 'browser-player-playstyles playstyle-badges'));
  const foot = String(card.preferred_foot ?? '').trim();
  const footLabel = /^(right|r|오른발)$/i.test(foot) ? 'Right'
    : /^(left|l|왼발)$/i.test(foot) ? 'Left' : foot || '-';
  const details = document.createElement('div');
  details.className = 'browser-player-foot-skills flex items-center justify-between';
  const preferredFoot = document.createElement('span');
  preferredFoot.textContent = `Foot: ${footLabel}`;
  const skills = document.createElement('span');
  skills.textContent = `SM ${card.sm ?? '-'}★ / WF ${card.wf ?? '-'}★`;
  details.append(preferredFoot, skills);
  const stats = document.createElement('div');
  stats.className = 'browser-player-stats grid grid-cols-6 gap-1 text-center';
  const displayedStats = getCardFaceStats(card, getCardPosition(card));
  for (const [label, value] of displayedStats) {
    const item = document.createElement('div');
    item.className = 'browser-player-stat';
    const title = document.createElement('span');
    title.className = 'browser-player-stat-label text-xs font-bold text-slate-800/90';
    title.textContent = label;
    const detail = document.createElement('strong');
    detail.className = 'browser-player-stat-value text-base font-black text-slate-950';
    detail.textContent = value;
    item.append(title, detail);
    stats.append(item);
  }
  const priceBar = document.createElement('div');
  priceBar.className = 'browser-player-price';
  priceBar.textContent = `🪙 ${Number(card.price || 0).toLocaleString()} C`;
  footer.append(details, stats, priceBar);
  article.append(content, footer);
  return article;
}
