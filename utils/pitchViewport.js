// Fit the complete squad, including protruding badges and prices, without scrolling.
export function fitPitchViewport(availableWidth, availableHeight, formationHeight) {
  const width = 900;
  const scale = availableWidth > 0 && availableHeight > 0
    ? Math.min(1, availableWidth / width, availableHeight / formationHeight) : 0;
  return { width, scale, fittedHeight: formationHeight * scale };
}
