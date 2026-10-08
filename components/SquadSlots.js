import { FORMATIONS } from '../utils/formations.js';

export const SQUAD_SLOTS_KEY = 'metaxi_saved_slots';
const clone = value => JSON.parse(JSON.stringify(value));
const fingerprint = value => JSON.stringify([value.formation, value.players, value.manager]);

export function isSavedSquadSlot(slot) {
  const formation = FORMATIONS.find(item => item.name === slot?.formation);
  return Boolean(slot && [1, 2, 3].includes(slot.id) && typeof slot.name === 'string'
    && formation && slot.players && !Array.isArray(slot.players)
    && Object.keys(slot.players).length === 11
    && formation.slots.every(({ position }) => {
      const entry = slot.players[position];
      return entry?.card && typeof entry.card === 'object' && !Array.isArray(entry.card)
        && ['string', 'number'].includes(typeof entry.card.id);
    })
    && (slot.manager === null || (typeof slot.manager === 'object' && !Array.isArray(slot.manager)))
    && Number.isFinite(slot.totalCost) && slot.totalCost >= 0
    && Number.isFinite(slot.totalChemistry) && slot.totalChemistry >= 0 && slot.totalChemistry <= 33
    && typeof slot.savedAt === 'string' && Number.isFinite(Date.parse(slot.savedAt)));
}

export function createSquadSlots({ mount, getCurrent, loadSquad, notify, storage = () => window.localStorage }) {
  let slots = [];
  let activeId = null;
  try {
    const saved = JSON.parse(storage().getItem(SQUAD_SLOTS_KEY) ?? '[]');
    if (!Array.isArray(saved)) throw new Error('Invalid slots');
    slots = saved.filter(isSavedSquadSlot).filter((slot, index, rows) => rows.findIndex(row => row.id === slot.id) === index);
    if (slots.length !== saved.length) notify('Some saved slots were invalid and could not be loaded.');
  } catch { notify('Saved slots could not be read. Browser storage may be unavailable.'); }

  function persist(next) {
    try { storage().setItem(SQUAD_SLOTS_KEY, JSON.stringify(next)); }
    catch { notify('Could not save slots. Browser storage is full or unavailable.'); return false; }
    slots = next;
    return true;
  }
  function save(id) {
    const slot = clone({ ...getCurrent(), id, name: `Slot ${id}`, savedAt: new Date().toISOString() });
    if (!isSavedSquadSlot(slot)) { notify('Place all 11 players on the pitch before saving a slot.'); return; }
    if (!persist([...slots.filter(item => item.id !== id), slot])) return;
    activeId = id;
    render();
    notify(`Slot ${id} saved.`);
  }
  function sync() {
    const active = slots.find(slot => slot.id === activeId);
    if (active && fingerprint(active) !== fingerprint(getCurrent())) {
      activeId = null;
      render();
    }
  }
  function render() {
    const focused = mount.contains(document.activeElement) ? document.activeElement.dataset.action : null;
    mount.replaceChildren();
    const heading = document.createElement('span');
    heading.className = 'squad-slots-label';
    heading.textContent = 'SQUAD PRESETS';
    mount.append(heading);
    for (const id of [1, 2, 3]) {
      const saved = slots.find(slot => slot.id === id);
      const group = document.createElement('div');
      group.className = `squad-slot${saved ? ' is-saved' : ''}${activeId === id ? ' is-active' : ''}`;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'squad-slot-main';
      button.dataset.action = `slot-${id}`;
      button.setAttribute('aria-pressed', String(activeId === id));
      button.setAttribute('aria-label', saved ? `Load Slot ${id}, ${saved.formation}, chemistry ${saved.totalChemistry}/33, cost ${saved.totalCost} coins` : `Save current squad to Slot ${id}`);
      const name = document.createElement('span');
      name.textContent = `Slot ${id}`;
      const info = document.createElement('span');
      info.className = 'squad-slot-info';
      info.textContent = saved ? `${saved.totalChemistry}/33 · ${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(saved.totalCost)} C` : '+ Save';
      button.append(name, info);
      button.title = saved ? `${saved.formation} · ${saved.totalCost.toLocaleString('en-US')} C · ${new Date(saved.savedAt).toLocaleString()}` : 'Save current squad';
      button.addEventListener('click', () => {
        if (!saved) return save(id);
        loadSquad(clone(saved));
        activeId = id;
        render();
        mount.querySelector(`[data-action="slot-${id}"]`).focus();
        notify(`Slot ${id} loaded: ${saved.formation}.`);
      });
      group.append(button);
      if (saved) {
        const actions = document.createElement('div');
        actions.className = 'squad-slot-actions';
        for (const action of ['Overwrite', 'Clear']) {
          const control = document.createElement('button');
          control.type = 'button';
          control.textContent = action;
          control.dataset.action = `${action}-${id}`;
          control.setAttribute('aria-label', `${action} Slot ${id}`);
          control.addEventListener('click', () => {
            if (action === 'Overwrite') return save(id);
            if (!persist(slots.filter(slot => slot.id !== id))) return;
            if (activeId === id) activeId = null;
            render();
            mount.querySelector(`[data-action="slot-${id}"]`).focus();
            notify(`Slot ${id} cleared.`);
          });
          actions.append(control);
        }
        group.append(actions);
      }
      mount.append(group);
    }
    if (focused) mount.querySelector(`[data-action="${focused}"]`)?.focus();
  }
  render();
  return { sync };
}
