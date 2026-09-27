export function createPitchChemistryBadge(points) {
  const score = Math.max(0, Math.min(3, Math.trunc(Number(points) || 0)));
  const badge = document.createElement('span');
  badge.className = 'pitch-chemistry-badge';
  badge.setAttribute('role', 'img');
  badge.setAttribute('aria-label', `케미스트리 ${score}점`);
  badge.title = `케미스트리 ${score}/3`;
  let index = 0;
  for (const count of [1, 2]) {
    const row = document.createElement('span');
    row.className = 'pitch-chemistry-row';
    row.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < count; i++) {
      const diamond = document.createElement('i');
      diamond.className = index++ < score ? 'is-filled' : '';
      row.append(diamond);
    }
    badge.append(row);
  }
  return badge;
}
