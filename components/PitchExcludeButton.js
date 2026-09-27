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
    button.title = excluded ? '자동 생성 제외 해제' : '자동 생성에서 제외';
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
  button.title = excluded ? '자동 생성 제외 해제' : '자동 생성에서 제외';
  button.setAttribute('aria-label', button.title);
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/></svg>';
  button.addEventListener('click', event => {
    event.stopPropagation();
    try {
      if (store.getState().excludedCardVersionIds.includes(id)) {
        store.unban(id);
        toast('자동 제외 목록에서 해제되었습니다.', 'success');
      } else {
        store.ban(id, `${card.name} · ${card.version || '카드'} (#${id})`);
        toast("자동생성 목록에서 제외되었습니다. 해제하려면 한번 더 누르거나 오른쪽 '제외 카드 관리'에서 해제해주세요.");
      }
    } catch (error) { toast(error.message); }
  });
  return button;
}
