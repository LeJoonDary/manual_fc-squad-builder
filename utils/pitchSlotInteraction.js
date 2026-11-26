// Read current slot state on every click, including after moves and removals.
export function handlePitchSlotClick(event, { entry, suppressed, locked, open, details }) {
  if (entry?.card) {
    event.preventDefault();
    event.stopPropagation();
    if (!suppressed) details?.(event.currentTarget);
    return;
  }
  if (!suppressed && !locked) open(event.currentTarget);
}
