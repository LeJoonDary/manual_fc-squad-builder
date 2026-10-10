import { getCardFaceStats } from '../utils/cardFaceStats.js';
import { formatCardVersion, pitchAffiliation } from '../utils/pitchCardLabels.js';


export function createPitchMiniCard(card, styles = [], catalog = {}, { createReviewButton } = {}) {
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const content = element('span', 'pitch-mini-content');

  const primary = card.primary_position || card.position || '';
  const secondary = [...new Set([
    ...(card.alt_positions ?? []),
    ...(card.alternative_positions ?? []),
    ...(card.secondary_positions ?? []),
  ])].filter(position => position && position !== primary && position !== card.assignedPosition);
  if (secondary.length) {
    const positions = element('span', 'pitch-mini-secondary');
    positions.style.left = '100%';
    positions.style.marginLeft = '-2px';
    for (const position of secondary) {
      const badge = element('span', '', position);
      badge.title = `Alternate Position: ${position}`;
      positions.append(badge);
    }
    content.append(positions);
  }
  const rating = element('span', 'pitch-mini-rating');
  rating.append(element('b', '', card.overall ?? card.rating ?? '–'));
  const positionRow = element('span', 'pitch-mini-position-row');
  const positionGroup = element('span', 'pitch-mini-position-group');
  positionGroup.append(element('b', 'pitch-mini-position', card.assignedPosition || primary));
  positionRow.append(positionGroup);
  const skills = element('span', 'pitch-mini-skills');
  const foot = String(card.preferred_foot ?? '').trim();
  const footLabel = /^(right|r|오른발)$/i.test(foot) ? 'R' : /^(left|l|왼발)$/i.test(foot) ? 'L' : '';
  if (footLabel) skills.append(element('span', 'pitch-mini-foot', footLabel));
  if (card.sm != null || card.wf != null) {
    const stars = element('span', 'pitch-mini-skill-values');
    stars.append(element('b', '', card.sm ?? '–'), element('span', 'pitch-mini-star', '★'), element('b', '', card.wf ?? '–'), element('span', 'pitch-mini-star', '★'));
    stars.title = `Skill Moves ${card.sm ?? '–'} / Weak Foot ${card.wf ?? '–'}`;
    skills.append(stars);
  }
  const name = element('strong', 'pitch-mini-name', card.name ?? '');
  name.title = card.name ?? '';
  if (card.version && card.version.toLowerCase() !== 'card') {
    const promo = element('span', 'pitch-mini-promo', formatCardVersion(card.version));
    promo.title = promo.textContent;
    positionRow.append(promo);
  }
  const stats = element('span', 'pitch-mini-stats');
  for (const [label, value] of getCardFaceStats(card)) {
    const stat = element('span', '');
    stat.append(element('small', '', label), element('b', '', value));
    stats.append(stat);
  }
  const affiliations = element('span', 'pitch-mini-affiliations');
  if (card.nation_flag_url) {
    const flag = element('img', '');
    flag.src = card.nation_flag_url;
    flag.alt = card.nation || 'Nation';
    flag.addEventListener('error', () => flag.remove());
    affiliations.append(flag);
  }
  let hasIcon = false;
  for (const key of ['league', 'club']) {
    const affiliation = pitchAffiliation(card, key, catalog);
    if (!affiliation.label || (affiliation.isIcon && hasIcon)) continue;
    if (affiliation.isIcon) hasIcon = true;
    const label = element('span', affiliation.isIcon ? 'pitch-mini-icon-label' : '', affiliation.label);
    label.title = affiliation.name;
    affiliations.append(label);
  }
  const header = element('span', 'pitch-mini-header');
  const affiliationRow = element('span', 'pitch-mini-affiliation-row');
  affiliationRow.append(affiliations);
  if (createReviewButton) affiliationRow.append(createReviewButton(card, { compact: true }));
  const identity = element('span', 'pitch-mini-identity');
  identity.append(name);
  header.append(rating, identity);
  const center = element('span', 'pitch-mini-center');
  content.append(header, positionRow, affiliationRow, center);
  if (skills.childElementCount) content.append(skills);
  content.append(stats);
  return content;
}
