import { clubsForLeague, renderSearchableSelect } from '../utils/affiliations.js';
import { ui } from '../src/i18n/languageStore';

const empty = () => ({ leagueId: '', clubId: '', nationId: '' });
export function createModalAffiliationFilter({ modal, onChange, onRetry }) {
  let catalog = { leagues: [], clubs: [], nations: [] };
  let state = empty(), draft = empty(), open = false;
  const element = document.createElement('div'); element.className = 'modal-affiliation';
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'modal-affiliation-trigger';
  trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-controls', 'modal-affiliation-popover');
  const quickReset = document.createElement('button'); quickReset.type = 'button'; quickReset.className = 'modal-affiliation-clear'; quickReset.textContent = '×';
  const popover = document.createElement('div'); popover.id = 'modal-affiliation-popover'; popover.className = 'modal-affiliation-popover';
  popover.setAttribute('popover', 'auto'); popover.setAttribute('role', 'dialog'); popover.hidden = true;
  element.append(trigger, quickReset, popover);
  const position = () => {
    if (!open) return;
    const panel = modal.querySelector('.modal-panel').getBoundingClientRect();
    const anchor = trigger.getBoundingClientRect();
    const width = Math.max(0, Math.min(460, panel.width - 24, window.innerWidth - 32));
    const left = Math.max(16, panel.left + 12, Math.min(anchor.right - width, panel.right - width - 12, window.innerWidth - width - 16));
    const top = Math.max(16, panel.top + 12, Math.min(anchor.bottom + 8, panel.bottom - 280, window.innerHeight - 296));
    Object.assign(popover.style, { width: `${width}px`, left: `${left}px`, top: `${top}px`,
      maxHeight: `${Math.max(0, Math.min(460, panel.bottom - top - 12, window.innerHeight - top - 16))}px` });
  };
  const updateButton = () => {
    const count = Object.values(state).filter(Boolean).length;
    trigger.textContent = `🌐 ${ui('Affiliation')}${count ? ` (${count})` : ''}`;
    trigger.setAttribute('aria-expanded', String(open));
    quickReset.hidden = !count; quickReset.setAttribute('aria-label', ui('Reset Affiliation'));
    popover.setAttribute('aria-label', ui('Affiliation'));
  };
  const close = () => {
    open = false;
    if (typeof popover.hidePopover === 'function' && popover.matches(':popover-open')) popover.hidePopover();
    popover.hidden = true; updateButton();
  };
  const apply = value => { state = { ...value }; close(); updateButton(); onChange({ ...state }); trigger.focus(); };
  const render = () => {
    popover.replaceChildren();
    const header = document.createElement('header');
    const title = document.createElement('strong'); title.textContent = ui('Affiliation');
    const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.textContent = '×'; dismiss.setAttribute('aria-label', ui('Close')); dismiss.onclick = () => { close(); trigger.focus(); };
    header.append(title, dismiss); popover.append(header);
    const groups = document.createElement('div'); groups.className = 'modal-affiliation-groups';
    const selectors = {};
    const populate = kind => {
      const table = { league: 'leagues', club: 'clubs', nation: 'nations' }[kind];
      const rows = kind === 'club' ? clubsForLeague(catalog.clubs, draft.leagueId) : catalog[table];
      const select = selectors[kind];
      if (!rows.some(row => String(row.id) === draft[kind + 'Id'])) draft[kind + 'Id'] = '';
      select.replaceChildren(new Option(ui({ league: 'All Leagues', club: 'All Clubs', nation: 'All Nations' }[kind]), ''),
        ...rows.map(row => new Option(row.name, String(row.id))));
      select.value = draft[kind + 'Id'];
      renderSearchableSelect(select, rows, { kind, leagues: catalog.leagues });
    };
    for (const kind of ['league', 'club', 'nation']) {
      const group = document.createElement('div');
      const label = document.createElement('label'); label.textContent = ui({ league: 'League', club: 'Club', nation: 'Nation' }[kind]);
      const select = document.createElement('select'); select.id = `modal-${kind}-filter`; label.htmlFor = select.id;
      selectors[kind] = select;
      select.onchange = () => { draft[kind + 'Id'] = select.value; if (kind === 'league') populate('club'); };
      group.append(label, select); groups.append(group);
    }
    popover.append(groups);
    for (const kind of ['league', 'club', 'nation']) populate(kind);
    if (!catalog.leagues.length && onRetry) {
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = ui('Reload Affiliations'); retry.onclick = onRetry; popover.append(retry);
    }
    const footer = document.createElement('footer');
    const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = ui('Reset'); reset.onclick = () => apply(empty());
    const submit = document.createElement('button'); submit.type = 'button'; submit.className = 'modal-affiliation-apply'; submit.textContent = ui('Apply'); submit.onclick = () => apply(draft);
    footer.append(reset, submit); popover.append(footer); position();
  };
  trigger.onclick = () => {
    if (open) return close();
    draft = { ...state }; open = true; popover.hidden = false; render();
    popover.showPopover?.(); position(); updateButton(); popover.querySelector('summary')?.focus();
  };
  quickReset.onclick = () => apply(empty());
  popover.addEventListener('toggle', event => {
    if (event.newState === 'closed' && open) { open = false; popover.hidden = true; updateButton(); }
  });
  document.addEventListener('pointerdown', event => { if (open && !element.contains(event.target)) close(); }, true);
  document.addEventListener('keydown', event => {
    if (open && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); trigger.focus(); }
  }, true);
  window.addEventListener('resize', position);
  modal.addEventListener('scroll', event => { if (open && !popover.contains(event.target)) position(); }, true);
  updateButton();
  return { element, getValue: () => ({ ...state }), close,
    reset: () => { state = empty(); draft = empty(); close(); },
    refresh: () => { updateButton(); if (open) render(); },
    setCatalog: value => { catalog = value; if (open) render(); },
  };
}
