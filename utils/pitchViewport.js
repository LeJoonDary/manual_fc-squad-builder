// Fit the complete squad, including protruding badges and prices, without scrolling.
export function fitSquadWorkspace(width, height, sidebarWidth, gap, headerHeight) {
  const pitchWidth = Math.max(0, width - sidebarWidth - gap);
  const pitchHeight = Math.max(0, height - headerHeight);
  return { pitchWidth, pitchHeight, headerHeight };
}

export function fitPitchViewport(availableWidth, availableHeight, formationHeight) {
  const width = 900;
  const scale = availableWidth > 0 && availableHeight > 0
    ? Math.min(availableWidth / width, availableHeight / formationHeight) : 0;
  return { width, scale, fittedHeight: formationHeight * scale };
}
