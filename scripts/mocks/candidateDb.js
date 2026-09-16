// In-memory Supabase-shaped stub: applies position/price filters, ordering and limit.
export function createCandidateMockDb(rows, error = null) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, orders: [] };
      calls.push(call);
      const query = {
        select(value) { call.select = value; return query; },
        in(column, values) { call.positionColumn = column; call.positions = values; return query; },
        gte(column, value) { call.minColumn = column; call.min = value; return query; },
        lte(column, value) { call.maxColumn = column; call.max = value; return query; },
        order(column, options) { call.orders.push({ column, ...options }); return query; },
        or(value) { call.or = value; return query; },
        async limit(value) {
          call.limit = value;
          const data = rows.filter(row => (!call.or || !['ICON', 'SPECIAL_ICON', 'HERO', 'SPECIAL_HERO'].includes(row.card_type))
            && row.price != null && row.price >= call.min && (call.max === undefined || row.price <= call.max)
            && row.card_positions.some(item => call.positions.includes(item.positions.name)))
            .sort((a, b) => {
              for (const order of call.orders) {
                const av = a[order.column], bv = b[order.column];
                if (av === bv) continue;
                if (av == null) return order.nullsFirst ? -1 : 1;
                if (bv == null) return order.nullsFirst ? 1 : -1;
                return (av < bv ? -1 : 1) * (order.ascending ? 1 : -1);
              }
              return 0;
            }).slice(0, value);
          return { data, error };
        },
      };
      return query;
    },
  };
}

export function mockCandidate(id, positions, price, overall = 80) {
  return { id, price, overall, players: { name: `선수 ${id}`, nation_id: 1 }, league_id: 1, club_id: id,
    card_positions: positions.map((name, index) => ({ is_primary: index === 0, positions: { name } })) };
}
