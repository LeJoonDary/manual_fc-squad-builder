import { getCardBackground } from '../utils/cardBackground.js';

// Shared DOM card component for the Players tab and selection modal.
export function createPlayerCard(card, {
  onActivate, actionLabel = '선수 상세 정보 보기', textAffiliations = false,
  getCardName, getCardRating, getCardPosition, getChemistryEntityLogo,
  createPlaystyleBadges, unwrapRelation, affiliationCatalog,
}) {
  const article = document.createElement('article');
  article.className = 'browser-player-card rounded-xl overflow-hidden shadow-md border border-slate-700/50 flex flex-col w-full';
  article.tabIndex = 0;
  article.setAttribute('role', 'button');
  article.setAttribute('aria-label', `${getCardName(card)} ${actionLabel}`);
  article.addEventListener('click', () => onActivate(card));
  article.addEventListener('keydown', (event) => {
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
    flag.alt = card.nation ? `${card.nation} 국기` : '국기';
    flag.title = card.nation ?? '';
    flag.width = 24;
    flag.loading = 'lazy';
    flag.addEventListener('error', () => flag.remove());
    affiliations.append(flag);
  }
  for (const key of ['league', 'club']) {
    const shortName = card[`${key}_short_name`];
    const fullName = card[key];
    const entity = affiliationCatalog[`${key}s`]?.find(row => String(row.id) === String(card[`${key}_id`]));
    const logoUrl = getChemistryEntityLogo(card, key) || entity?.logo_url;
    if (!shortName && !fullName && !logoUrl) continue;
    const label = document.createElement('span');
    label.textContent = shortName || fullName || '';
    label.title = fullName ?? shortName ?? '';
    if (logoUrl && !textAffiliations) {
      const logo = document.createElement('img');
      logo.className = 'browser-player-logo';
      logo.src = logoUrl;
      logo.alt = fullName || shortName || key;
      logo.loading = 'lazy';
      logo.addEventListener('error', () => label.replaceChildren(shortName || fullName || ''));
      label.replaceChildren(logo);
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
  position.title = '주 포지션';
  positions.append(position);
  for (const secondary of card.secondary_positions ?? []) {
    const badge = document.createElement('span');
    badge.className = 'browser-player-secondary-position bg-slate-900/60 text-slate-200 border border-slate-600/60';
    badge.textContent = secondary;
    badge.title = '부 포지션';
    positions.append(badge);
  }
  const score = document.createElement('div');
  score.className = 'browser-player-meta-score bg-slate-950/85 text-emerald-400 border border-emerald-500/50 font-extrabold px-2 py-0.5 rounded-md';
  score.textContent = card.meta_score === null ? '[메타 점수: 미지원]' : `[메타 점수: ${card.meta_score.toFixed(1)}]`;
  score.title = card.score_position ? `${card.score_position} 기준 · 3백 미적용` : '이 포지션의 가중치가 아직 없습니다.';
  affiliations.append(score);
  content.append(identity, positions, affiliations,
    createPlaystyleBadges(card, Infinity, 'browser-player-playstyles playstyle-badges'));
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
  const isGoalkeeper = String(card.primary_position || card.position || '').trim().toUpperCase() === 'GK';
  const displayedStats = isGoalkeeper ? [
    ['DIV', statValue('goalkeeping_diving', 'gk_diving', 'pace', 'pac')],
    ['HAN', statValue('goalkeeping_handling', 'gk_handling', 'shooting', 'sho')],
    ['KIC', statValue('goalkeeping_kicking', 'gk_kicking', 'passing', 'pas')],
    ['REF', statValue('goalkeeping_reflexes', 'gk_reflexes', 'dribbling', 'dri')],
    ['SPD', statValue('defending', 'def', 'movement_sprint_speed', 'sprint_speed')],
    ['POS', statValue('goalkeeping_positioning', 'gk_positioning', 'physicality', 'phy')],
  ] : [
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
