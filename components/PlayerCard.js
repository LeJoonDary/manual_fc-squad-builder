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
  content.style.backgroundImage = backgroundUrl
    ? `linear-gradient(to bottom, rgba(15,23,42,.2) 0%, rgba(15,23,42,.35) 45%, rgba(15,23,42,.75) 78%, #0f172a 100%), url(${JSON.stringify(backgroundUrl)})` : 'none';
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
  footer.className = `browser-player-footer w-full p-2.5 flex flex-col font-bold ${
    /gold/i.test(card.version ?? '') ? 'bg-[#D4A83B] text-slate-900'
      : /silver/i.test(card.version ?? '') ? 'bg-[#979A9A] text-slate-900'
        : /bronze/i.test(card.version ?? '') ? 'bg-[#C2845C] text-slate-900'
          : 'bg-slate-800 text-slate-100'
  }`;
  const positions = document.createElement('div');
  positions.className = 'browser-player-positions';
  const position = document.createElement('strong');
  position.className = 'browser-player-position bg-slate-950/80 text-amber-300 border border-amber-400/80 font-bold';
  position.textContent = card.primary_position || getCardPosition(card) || '-';
  position.title = 'Primary Position';
  positions.append(position);
  for (const secondary of card.secondary_positions ?? []) {
    const badge = document.createElement('span');
    badge.className = 'browser-player-secondary-position bg-slate-900/60 text-slate-200 border border-slate-600/60';
    badge.textContent = secondary;
    badge.title = 'Alternate Position';
    positions.append(badge);
  }
  if (!card.summary_only) {
    const score = document.createElement('div');
    score.className = 'browser-player-meta-score bg-slate-950/85 text-emerald-400 border border-emerald-500/50 font-extrabold px-2 py-0.5 rounded-md';
    score.textContent = card.meta_score == null ? '[Meta Score: N/A]' : `[Meta Score: ${card.meta_score.toFixed(1)}]`;
    score.title = card.score_position ? `${card.score_position} · Excludes 3-back adjustments` : 'Position weights are not available yet.';
    affiliations.append(score);
  }
  if (createReviewButton) positions.append(createReviewButton(card));
  content.append(identity, positions, affiliations);
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
  const rawStats = unwrapRelation(card.raw?.player_stats) ?? {};
  const rawPlayer = unwrapRelation(card.raw?.players) ?? {};
  // Read display aliases without changing the shared card data mapping.
  const statValue = (...keys) => {
    for (const key of keys) {
      const value = card[key] ?? rawStats[key] ?? rawPlayer[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return '-';
  };
  const displayedStats = [
    ['PAC', statValue('pace', 'pac')],
    ['SHO', statValue('shooting', 'sho')],
    ['PAS', statValue('passing', 'pas')],
    ['DRI', statValue('dribbling', 'dri')],
    ['DEF', statValue('defending', 'def')],
    ['PHY', statValue('physicality', 'phy')],
  ];
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
  footer.append(details, stats);
  article.append(content, footer);
  return article;
}
