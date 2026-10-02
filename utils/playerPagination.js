export const PLAYER_PAGE_SIZE = 40;

// A page may contain no visible matches after client-side filters. Advance by
// fetched rows, not visible rows, and keep the next-page action available.
export function createPlayerPagination(pageSize = PLAYER_PAGE_SIZE) {
  let generation = 0;
  const state = { offset: 0, hasMore: true, loading: false, cards: [], total: null };
  return {
    state,
    reset() {
      generation += 1;
      Object.assign(state, { offset: 0, hasMore: true, loading: false, cards: [], total: null });
    },
    begin() {
      if (state.loading || !state.hasMore) return null;
      state.loading = true;
      return { generation, offset: state.offset };
    },
    complete(ticket, rows, cards, total = null) {
      if (ticket.generation !== generation) return false;
      const seen = new Set(state.cards.map(card => String(card.id)));
      for (const card of cards) {
        if (!seen.has(String(card.id))) {
          state.cards.push(card);
          seen.add(String(card.id));
        }
      }
      state.offset += rows.length;
      state.total = total;
      state.hasMore = total === null ? rows.length === pageSize : state.offset < total;
      state.loading = false;
      return true;
    },
    fail(ticket) {
      if (ticket.generation === generation) state.loading = false;
    },
  };
}

export async function fetchPlayerPage(query, offset, fetchDetails) {
  const { data, error } = await query.limit(PLAYER_PAGE_SIZE).range(offset, offset + PLAYER_PAGE_SIZE - 1);
  if (error) throw error;
  const page = data ?? [];
  return fetchPlayerDetails(page, fetchDetails);
}

export async function fetchPlayerDetails(page, fetchDetails) {
  if (!fetchDetails || !page.length) return page;
  const { data: details, error: detailError } = await fetchDetails(page.map(row => row.id));
  if (detailError) throw detailError;
  const byId = new Map((details ?? []).map(row => [String(row.id), row]));
  if (page.some(row => !byId.has(String(row.id)))) {
    throw new Error('Unable to load some player details. Please try again.');
  }
  return page.map(row => byId.get(String(row.id)));
}
