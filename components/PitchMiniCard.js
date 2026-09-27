import { formatCardVersion, pitchAffiliation } from '../utils/pitchCardLabels.js';
import { createPlaystyleIcons } from './PlaystyleIcons.js';

export function createPitchMiniCard(card, styles = [], catalog = {}) {
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const content = element('span', 'pitch-mini-content');
  const badges = element('span', 'pitch-mini-badges');
  const primary = card.primary_position || card.position || '';
  const rating = element('span', 'pitch-mini-rating');
  rating.append(element('b', '', card.overall ?? card.rating ?? '–'), element('b', '', primary));
  const secondary = [...new Set(card.secondary_positions ?? card.alt_positions ?? [])].filter(p => p && p !== primary);
  const positions = element('span', 'pitch-mini-secondary');
  for (const position of secondary) positions.append(element('span', '', position));
  const plus = createPlaystyleIcons(styles.filter(style => style.isPlus && style.image_url_plus).slice(0, 2), 'pitch-mini-plus');
  const skills = element('span', 'pitch-mini-skills');
  const foot = String(card.preferred_foot ?? '').trim();
  const footLabel = /^(right|r|오른발)$/i.test(foot) ? 'R' : /^(left|l|왼발)$/i.test(foot) ? 'L' : '';
  if (footLabel) skills.append(element('span', '', footLabel));
  if (card.sm != null || card.wf != null) {
    const stars = element('span', '', `${card.sm ?? '–'}★${card.wf ?? '–'}`);
    stars.title = `개인기 ${card.sm ?? '–'} / 약발 ${card.wf ?? '–'}`;
    skills.append(stars);
  }
  if (positions.childElementCount) badges.append(positions);
  if (plus.childElementCount) badges.append(plus);
  if (skills.childElementCount) badges.append(skills);
  const name = element('strong', 'pitch-mini-name', card.name ?? '');
  name.title = card.name ?? '';
  const promo = element('span', 'pitch-mini-promo', formatCardVersion(card.version));
  promo.title = promo.textContent;
  const stats = element('span', 'pitch-mini-stats');
  const rawStats = Array.isArray(card.raw?.player_stats) ? card.raw.player_stats[0] : card.raw?.player_stats;
  for (const [label, key, alias] of [['PAC', 'pac', 'pace'], ['SHO', 'sho', 'shooting'],
    ['PAS', 'pas', 'passing'], ['DRI', 'dri', 'dribbling'], ['DEF', 'def', 'defending'], ['PHY', 'phy', 'physicality']]) {
    const stat = element('span', '');
    stat.append(element('small', '', label), element('b', '', card[key] ?? card[alias] ?? rawStats?.[key] ?? '–'));
    stats.append(stat);
  }
  const affiliations = element('span', 'pitch-mini-affiliations');
  if (card.nation_flag_url) {
    const flag = element('img', '');
    flag.src = card.nation_flag_url;
    flag.alt = card.nation || '국가';
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
  const identity = element('span', 'pitch-mini-identity');
  identity.append(name);
  header.append(rating, identity);
  content.classList.toggle('has-secondary', positions.childElementCount > 0);
  const center = element('span', 'pitch-mini-center');
  center.append(promo);
  content.append(header, affiliations, badges, center, stats);
  return content;
}
