// Read current slot state on every click, including after moves and removals.
export function handlePitchSlotClick(event, { entry, suppressed, locked, open }) {
  if (entry?.card) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (!suppressed && !locked) open(event.currentTarget);
}
