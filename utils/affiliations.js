const pinnedLeagueIds = ['3', '2', '4', '12', '5', '6', '1', '8'];
const leagueRank = row => {
  const index = pinnedLeagueIds.indexOf(String(row.id));
  return index < 0 ? Infinity : index;
};
const priorities = {
  nations: ['France', 'England', 'Germany', 'Spain', 'Argentina', 'Brazil', 'Portugal', 'Netherlands', 'Italy'],
  leagues: ['Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1'],
};
const canonical = name => name.toLowerCase().replace(/\s/g, '').replace(/^laligaeasports$/, 'laliga');
export function sortAffiliations(rows, table) {
  const preferred = (priorities[table] ?? []).map(canonical);
  const rank = name => { const i = preferred.indexOf(canonical(name)); return i < 0 ? Infinity : i; };
  const rowRank = row => {
    if (table !== 'leagues') return rank(row.name);
    // Stable IDs distinguish leagues with identical names or renamed sponsors.
    return leagueRank(row);
  };
  return [...rows].sort((a, b) => (rowRank(a) - rowRank(b)) || a.name.localeCompare(b.name, 'en'));
}
export function clubsForLeague(clubs, leagueId) {
  return clubs.filter(club => !leagueId || String(club.league_id) === String(leagueId));
}
export async function fetchAffiliations(db) {
  if (!db) throw new Error('Supabase connection is not configured.');
  const entries = await Promise.all(['nations', 'leagues', 'clubs'].map(async table => {
    const rows = [];
    for (let offset = 0; ; ) {
      const { data, error } = await db.from(table).select('*').order('id').range(offset, offset + 499);
      if (error) throw error;
      if (!data?.length) return [table, sortAffiliations(rows, table)];
      rows.push(...data);
      offset += data.length;
    }
  }));
  return Object.fromEntries(entries);
}

export function renderSearchableSelect(select, rows) {
  const pickerId = select.id.replace('-filter', '') + '-picker';
  const kind = select.id.replace('-filter', '').replace('manager-', '');
  const label = { nation: 'Nation', league: 'League', club: 'Club' }[kind];
  let picker = document.getElementById(pickerId);
  if (!picker) {
    picker = document.createElement('details');
    picker.id = pickerId;
    picker.className = 'nation-picker';
    select.after(picker);
    select.hidden = true;
    picker.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.matches('input')) event.preventDefault();
      if (event.key === 'Escape') { event.stopPropagation(); picker.open = false; picker.querySelector('summary').focus(); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const controls = [...picker.querySelectorAll('input, .nation-options button')];
        const current = controls.indexOf(document.activeElement);
        if (current >= 0) {
          event.preventDefault();
          controls[Math.max(0, Math.min(controls.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))].focus();
        }
      }
    });
    picker.addEventListener('toggle', () => {
      if (!picker.open) return;
      document.querySelectorAll('.nation-picker').forEach(other => { if (other !== picker) other.open = false; });
      const input = picker.querySelector('input');
      input.value = '';
      input.dispatchEvent(new Event('input'));
      input.focus();
    });
  }
  const optionsData = [...select.options].map(option => ({
    id: option.value, name: option.textContent,
    flag_url: kind === 'nation' ? rows.find(row => String(row.id) === option.value)?.flag_url : null,
  }));
  const content = (element, row) => {
    if (typeof row?.flag_url === 'string' && row.flag_url.trim()) {
      const image = document.createElement('img');
      image.src = row.flag_url; image.alt = ''; image.loading = 'lazy';
      image.addEventListener('error', () => image.remove());
      element.append(image);
    }
    element.append(document.createTextNode(row?.name ?? 'All ' + label + 's'));
  };
  const summary = document.createElement('summary');
  summary.setAttribute('aria-label', 'Select ' + label);
  content(summary, optionsData.find(row => row.id === select.value));
  const panel = document.createElement('div');
  panel.className = 'searchable-select-panel';
  const input = document.createElement('input');
  input.type = 'search'; input.placeholder = 'Search ' + label.toLowerCase() + 's...';
  input.setAttribute('aria-label', 'Search ' + label.toLowerCase() + 's');
  input.autocomplete = 'off';
  const options = document.createElement('div');
  options.className = 'nation-options';
  const renderOptions = () => {
    const term = input.value.trim().toLowerCase();
    const filtered = optionsData.filter(row => !row.id || row.name.toLowerCase().includes(term));
    if (kind === 'league') filtered.sort((a, b) => {
      if (!a.id || !b.id) return a.id ? 1 : b.id ? -1 : 0;
      return (!term && (leagueRank(a) - leagueRank(b))) || a.name.localeCompare(b.name, 'en');
    });
    options.replaceChildren();
    let pinnedShown = false;
    let dividerShown = false;
    for (const row of filtered) {
      if (kind === 'league' && !term && row.id) {
        if (Number.isFinite(leagueRank(row))) pinnedShown = true;
        else if (pinnedShown && !dividerShown) {
          const divider = document.createElement('hr');
          divider.className = 'league-options-divider';
          options.append(divider);
          dividerShown = true;
        }
      }
      const button = document.createElement('button'); button.type = 'button';
      button.setAttribute('aria-pressed', String(select.value === row.id));
      content(button, row);
      button.addEventListener('click', () => {
        select.value = row.id;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        picker.open = false;
        renderSearchableSelect(select, rows);
        picker.querySelector('summary').focus();
      });
      options.append(button);
    }
    if (filtered.length === 1 && term) {
      const empty = document.createElement('p'); empty.textContent = 'No results found.';
      empty.setAttribute('role', 'status'); options.append(empty);
    }
  };
  input.addEventListener('input', renderOptions);
  renderOptions(); panel.append(input, options);
  picker.replaceChildren(summary, panel);
}
