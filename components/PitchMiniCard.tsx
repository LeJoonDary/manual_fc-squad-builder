import { PlayerCard } from './PlayerCard.tsx';

// DOM-based app: reuse the master node without any independent card markup.
// Toolbar, chemistry and price remain on the existing parent slot in main.js.
type MasterProps = Parameters<typeof PlayerCard>[0];
export function createPitchMiniCard(
  card: MasterProps['card'],
  styles: MasterProps['styles'] = [],
  catalog: MasterProps['catalog'] = {},
  { createReviewButton }: Pick<MasterProps, 'createReviewButton'> = {},
) {
  const cardView = PlayerCard({ card, styles, catalog, createReviewButton, prioritizePortrait: true });
  cardView.classList.add('pitch-card-frame');
  return cardView;
}
