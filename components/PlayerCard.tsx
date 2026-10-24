import { getCardFaceStats } from '../utils/cardFaceStats.js';
import { pitchAffiliation } from '../utils/pitchCardLabels.js';
import { normalizePlaystyles } from '../utils/normalizePlaystyles.js';
import { createPlaystyleIcons } from './PlaystyleIcons.js';
import { getCardBackground } from '../utils/cardBackground.js';

// Shared by catalog and pitch cards; preserve the base families alongside DB-tagged headshots.
function isHeadshotCard(card: Record<string, any>): boolean {
  const version = typeof card.version === 'string' ? card.version.toLowerCase().trim() : '';
  const cardType = typeof card.card_type === 'string' ? card.card_type.toUpperCase() : '';
  return ['gold', 'silver', 'bronze'].includes(version)
    || version.includes('base_icon')
    || version.includes('base_hero')
    || version.includes('hall_of_fut')
    || cardType.includes('HEADSHOT');
}

const unwrap = (value: any) => Array.isArray(value) ? value[0] : value;
const element = (tag: string, className: string, text?: unknown): any => {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
};
const image = (className: string, url: string, alt: string, priority = false, eager = false) => {
  const node = element('img', className);
  node.referrerPolicy = 'no-referrer';
  // Set request hints before src starts the download.
  if (priority || eager) {
    node.setAttribute('loading', 'eager');
  }
  if (priority) {
    node.setAttribute('fetchpriority', 'high');
  }
  if (priority || eager) node.setAttribute('decoding', 'async');
  node.src = url;
  node.alt = alt;
  node.draggable = false;
  return node;
};

// A 250 x 313.2 card plus a 48px external trait dock scale together on both surfaces.
// The custom element owns observer cleanup when cards are removed/replaced.
class PlayerCardFrame extends HTMLElement {
  private resizeObserver?: ResizeObserver;
  connectedCallback() {
    const resize = (width: number) => this.style.setProperty('--card-scale', String(width / 250));
    resize(this.getBoundingClientRect().width);
    this.resizeObserver = new ResizeObserver(entries => resize(entries[0].contentRect.width));
    this.resizeObserver.observe(this);
  }
  disconnectedCallback() {
    this.resizeObserver?.disconnect();
  }
}
if (!customElements.get('player-card-frame')) customElements.define('player-card-frame', PlayerCardFrame);

type PlayerCardProps = {
  card: Record<string, any>;
  styles?: any[];
  catalog?: Record<string, any[]>;
  createReviewButton?: (card: any, options: { compact: boolean }) => HTMLButtonElement;
};
export function PlayerCard({ card, styles = [], catalog = {}, createReviewButton }: PlayerCardProps): HTMLElement {
  const frame = element('player-card-frame', 'ea-card-frame');
  const canvas = element('span', 'ea-card-canvas');
  const face = element('span', 'ea-card-face');
  const backgroundUrl = getCardBackground(card);
  if (backgroundUrl) {
    const background = image('ea-card-background', backgroundUrl, card.name || 'player card', false, true);
    background.addEventListener('error', () => background.remove(), { once: true });
    face.append(background);
  }
  const top = element('span', 'ea-card-top');
  const column = element('span', 'ea-card-column');
  const primary = card.primary_position || card.position || '–';
  column.append(element('b', 'ea-card-rating', card.overall ?? card.rating ?? '–'),
    element('b', 'ea-card-position', primary));
  for (const key of ['nation', 'league', 'club']) {
    const relation = unwrap(card[`${key}s`] ?? card.raw?.[`${key}s`] ?? card[key]);
    const entity = catalog[`${key}s`]?.find(row => String(row.id) === String(card[`${key}_id`] ?? relation?.id));
    const nationName = (typeof card.nation === 'string' ? card.nation : relation?.name) || entity?.name || '';
    const affiliation = key === 'nation'
      ? { name: nationName, label: nationName.slice(0, 3).toUpperCase() }
      : pitchAffiliation(card, key, catalog);
    const url = key === 'nation'
      ? card.flag_url || card.nation_flag_url || relation?.flag_url || entity?.flag_url
      : card[key]?.logo_url || card[`${key}_logo_url`] || relation?.logo_url || entity?.logo_url;
    const fallback = element('span', 'ea-card-emblem-label', affiliation.label || '–');
    fallback.title = affiliation.name || key;
    if (url) {
      const logo = image(`ea-card-emblem ea-card-emblem--${key}`, url, affiliation.name || key);
      logo.addEventListener('error', () => logo.replaceWith(fallback), { once: true });
      column.append(logo);
    } else column.append(fallback);
  }
  top.append(column);
  const secondary = [...new Set([
    ...(card.alt_positions ?? []), ...(card.alternative_positions ?? []), ...(card.secondary_positions ?? []),
  ])].filter(position => position && position !== primary);
  if (secondary.length) {
    const positions = element('span', 'ea-card-secondary');
    for (const position of secondary) {
      const badge = element('span', '', position);
      badge.title = `Alternate Position: ${position}`;
      positions.append(badge);
    }
    // Keep edge badges outside the face's portrait-clipping boundary.
    canvas.append(positions);
  }
  if (card.image_url) {
    const portrait = image(`ea-card-portrait${isHeadshotCard(card) ? ' ea-card-portrait--headshot' : ''}`,
      card.image_url, card.name || 'Player', true);
    portrait.addEventListener('error', () => portrait.remove(), { once: true });
    // Anchor to the entire face so the portrait can extend behind the name.
    face.append(portrait);
  }
  const identity = element('span', 'ea-card-identity');
  const name = element('strong', 'ea-card-name', card.name || '');
  name.title = card.name || '';
  identity.append(name);
  if (createReviewButton) {
    const review = createReviewButton(card, { compact: true });
    review.classList.add('ea-card-review');
    identity.append(review);
  }
  const resolved = normalizePlaystyles(card, card.raw, unwrap(card.raw?.players), { playstyles: styles });
  const traits = createPlaystyleIcons(resolved, 'ea-card-playstyles', 7);
  traits.setAttribute('aria-label', 'PlayStyles');
  while (traits.childElementCount < 7) {
    const placeholder = element('span', 'playstyle-icon is-empty');
    placeholder.setAttribute('aria-hidden', 'true');
    traits.append(placeholder);
  }
  const info = element('span', 'ea-card-info');
  const foot = String(card.preferred_foot ?? '').trim();
  const footLabel = /^(right|r|오른발)$/i.test(foot) ? 'Right' : /^(left|l|왼발)$/i.test(foot) ? 'Left' : '–';
  const preferredFoot = element('span', 'ea-card-foot');
  preferredFoot.append(element('span', 'ea-card-full-info', `Foot: ${footLabel}`),
    element('span', 'ea-card-short-info', footLabel === 'Right' ? 'R' : footLabel === 'Left' ? 'L' : '–'));
  preferredFoot.title = `Preferred Foot: ${foot || 'Unknown'}`;
  const skills = element('span', 'ea-card-skills');
  skills.append(element('span', 'ea-card-full-info', 'SM '), document.createTextNode(`${card.sm ?? '–'}`), element('span', 'ea-card-star', '★'),
    element('span', 'ea-card-full-info', ' / WF '), document.createTextNode(`${card.wf ?? '–'}`), element('span', 'ea-card-star', '★'));
  skills.setAttribute('aria-label', `Skill Moves ${card.sm ?? '–'} / Weak Foot ${card.wf ?? '–'}`);
  info.append(preferredFoot, skills);
  const stats = element('span', 'ea-card-stats');
  for (const [label, value] of getCardFaceStats(card)) {
    const stat = element('span', '');
    stat.append(element('small', '', label), element('b', '', value));
    stats.append(stat);
  }
  face.append(top, identity, info, stats);
  const dock = element('span', 'ea-card-trait-dock');
  dock.append(traits);
  canvas.append(face, dock);
  frame.append(canvas);
  return frame;
}
