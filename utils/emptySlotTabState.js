/** In-memory preference only: empty-slot tabs never share state with replacement tabs. */
export function createEmptySlotTabState() {
  let remembered = 'all_meta';
  return {
    active(lockedCount) {
      if (!lockedCount) remembered = 'all_meta';
      return remembered;
    },
    select(tab, lockedCount) {
      if (['all_meta', 'meta_synergy', 'chem_boost'].includes(tab)) remembered = tab;
      return this.active(lockedCount);
    },
  };
}
