import { excludedCardVersionsStore as store, getCardVersionId } from '../utils/excludedCardVersions.js';
import { setCardAction } from '../src/i18n/cardActions';
import { getLanguage } from '../src/i18n/languageStore';
import { translations } from '../src/locales/translations';

let timer;
function toast(message, tone = 'warning', key) {
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
  if (key) node.dataset.i18n = `toasts.${key}`;
  else node.removeAttribute('data-i18n');
  node.textContent = key ? translations[getLanguage()].toasts[key] : message;
  timer = setTimeout(() => { node.hidden = true; }, 6000);
}

export function syncPitchExclusions() {
  const ids = store.getState().excludedCardVersionIds;
  document.querySelectorAll('.exclude-player').forEach(button => {
    const excluded = ids.includes(button.dataset.cardVersionId);
    button.setAttribute('aria-pressed', String(excluded));
    setCardAction(button, excluded ? 'removeExclusion' : 'exclude');
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
  setCardAction(button, excluded ? 'removeExclusion' : 'exclude');
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/></svg>';
  button.addEventListener('click', event => {
    event.stopPropagation();
    try {
      if (store.getState().excludedCardVersionIds.includes(id)) {
        store.unban(id);
        toast(null, 'success', 'excludedRemoved');
      } else {
        store.ban(id, `${card.name} · ${card.version || 'Card'} (#${id})`);
        toast(null, 'warning', 'excludedSuccess');
      }
    } catch (error) { toast(error.message); }
  });
  return button;
}
