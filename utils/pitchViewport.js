// Scale the complete formation uniformly, including cards and external prices.
export function fitPitchViewport(availableWidth, availableHeight, formationHeight) {
  const width = formationHeight * 5 / 6;
  const scale = Math.max(0, Math.min(availableWidth / width, availableHeight / formationHeight));
  return { width, scale, fittedHeight: formationHeight * scale };
}
