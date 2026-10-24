import { PlayerCard } from './PlayerCard.tsx';


// Shared DOM card component for the Players tab and selection modal.
export function createPlayerCard(card, {
  onActivate, actionLabel = 'View player details', showMetaScore = true,
  getCardName, getCardRating, getCardPosition,
  unwrapRelation, affiliationCatalog, createReviewButton,
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
  content.append(PlayerCard({ card: {
    ...card,
    name: getCardName(card),
    overall: getCardRating(card),
    primary_position: card.primary_position || getCardPosition(card),
  }, catalog: affiliationCatalog, createReviewButton }));
  const footer = document.createElement('div');
  footer.className = 'browser-player-footer w-full p-2.5 flex flex-col font-bold';
  let score;
  if (showMetaScore && !card.summary_only) {
    score = document.createElement('div');
    score.className = 'browser-player-meta-score bg-slate-950/85 text-emerald-400 border border-emerald-500/50 font-extrabold px-2 py-0.5 rounded-md';
    score.textContent = card.meta_score == null ? '[Meta Score: N/A]' : `[Meta Score: ${card.meta_score.toFixed(1)}]`;
    score.title = card.score_position ? `${card.score_position} · Excludes 3-back adjustments` : 'Position weights are not available yet.';
  }
  const metadata = document.createElement('div');
  metadata.className = 'browser-player-metadata';
  if (score) metadata.append(score);
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
    metadata.append(physical);
  }
  if (metadata.childElementCount) content.prepend(metadata);
  const priceBar = document.createElement('div');
  priceBar.className = 'browser-player-price';
  priceBar.textContent = `🪙 ${Number(card.price || 0).toLocaleString()} C`;
  footer.append(priceBar);
  article.append(content, footer);
  return article;
}
