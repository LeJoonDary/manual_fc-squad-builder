export const PLAYER_PAGE_SIZE = 50;

// A page may contain no visible matches after client-side filters. Advance by
// fetched rows, not visible rows, and keep the next-page action available.
export function createPlayerPagination() {
  let generation = 0;
  const state = { offset: 0, hasMore: true, loading: false, cards: [] };
  return {
    state,
    reset() {
      generation += 1;
      Object.assign(state, { offset: 0, hasMore: true, loading: false, cards: [] });
    },
    begin() {
      if (state.loading || !state.hasMore) return null;
      state.loading = true;
      return { generation, offset: state.offset };
    },
    complete(ticket, rows, cards) {
      if (ticket.generation !== generation) return false;
      const seen = new Set(state.cards.map(card => String(card.id)));
      for (const card of cards) {
        if (!seen.has(String(card.id))) {
          state.cards.push(card);
          seen.add(String(card.id));
        }
      }
      state.offset += rows.length;
      state.hasMore = rows.length === PLAYER_PAGE_SIZE;
      state.loading = false;
      return true;
    },
    fail(ticket) {
      if (ticket.generation === generation) state.loading = false;
    },
  };
}

export async function fetchPlayerPage(query, offset) {
  const { data, error } = await query.limit(PLAYER_PAGE_SIZE).range(offset, offset + PLAYER_PAGE_SIZE - 1);
  if (error) throw error;
  return data ?? [];
}
