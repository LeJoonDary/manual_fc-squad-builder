import { excludedCardVersionsStore as store, getCardVersionId } from '../utils/excludedCardVersions.js';

let timer;
function toast(message, tone = 'warning') {
  let node = document.querySelector('#pitch-action-toast');
  if (!node) {
    node = document.createElement('div');
    node.id = 'pitch-action-toast';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    document.body.append(node);
  }
  clearTimeout(timer);
  node.hidden = false;
  node.dataset.tone = tone;
  node.textContent = message;
  timer = setTimeout(() => { node.hidden = true; }, 6000);
}

export function syncPitchExclusions() {
  const ids = store.getState().excludedCardVersionIds;
  document.querySelectorAll('.exclude-player').forEach(button => {
    const excluded = ids.includes(button.dataset.cardVersionId);
    button.setAttribute('aria-pressed', String(excluded));
    button.title = excluded ? 'Remove auto build exclusion' : 'Exclude from auto build';
    button.setAttribute('aria-label', button.title);
    button.closest('.slot')?.classList.toggle('is-excluded', excluded);
  });
}

export function createPitchExcludeButton(card) {
  const id = getCardVersionId(card);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'exclude-player';
  button.dataset.cardVersionId = id ?? '';
  button.disabled = !id;
  const excluded = store.getState().excludedCardVersionIds.includes(id);
  button.setAttribute('aria-pressed', String(excluded));
  button.title = excluded ? 'Remove auto build exclusion' : 'Exclude from auto build';
  button.setAttribute('aria-label', button.title);
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/></svg>';
  button.addEventListener('click', event => {
    event.stopPropagation();
    try {
      if (store.getState().excludedCardVersionIds.includes(id)) {
        store.unban(id);
        toast('Removed from auto build exclusions.', 'success');
      } else {
        store.ban(id, `${card.name} · ${card.version || 'Card'} (#${id})`);
        toast("Excluded from auto build. Click again or use 'Manage Excluded Cards' on the right to remove the exclusion.");
      }
    } catch (error) { toast(error.message); }
  });
  return button;
}
