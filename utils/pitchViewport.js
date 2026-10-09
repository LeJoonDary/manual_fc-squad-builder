// Fit the complete squad, including protruding badges and prices, without scrolling.
export function fitSquadWorkspace(width, height, sidebarWidth, gap, headerHeight, maxPitchHeight = 1600) {
  const pitchHeight = Math.max(0, Math.min(maxPitchHeight, height - headerHeight, (width - sidebarWidth - gap) * 5 / 4));
  return { pitchWidth: pitchHeight * 4 / 5, pitchHeight, headerHeight };
}

export function fitPitchViewport(availableWidth, availableHeight, formationHeight) {
  const width = 900;
  const scale = availableWidth > 0 && availableHeight > 0
    ? Math.min(availableWidth / width, availableHeight / formationHeight) : 0;
  return { width, scale, fittedHeight: formationHeight * scale };
}
