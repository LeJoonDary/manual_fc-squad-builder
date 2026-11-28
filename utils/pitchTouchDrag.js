// Keep native scrolling/pinch untouched until a stationary single-touch hold.
export function bindPitchTouchDrag(root, { getEntry, isLocked, canMove, move, onDragStart, onDragEnd }) {
  if (!root) return;
  let pending, timer, ghost, target, ignoreClickUntil = 0;
  const clear = () => {
    const wasDragging = Boolean(ghost);
    clearTimeout(timer);
    pending?.slot.classList.remove('is-dragging');
    target?.classList.remove('is-drop-target');
    ghost?.remove();
    pending = timer = ghost = target = null;
    if (wasDragging) {
      onDragEnd?.();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
  };
  const cancel = () => {
    if (ghost) ignoreClickUntil = Date.now() + 600;
    clear();
  };
  const valid = () => pending?.slot.isConnected && getEntry(pending.slot) === pending.entry && !isLocked(pending.entry);
  const point = touch => {
    ghost.style.left = `${touch.clientX}px`;
    ghost.style.top = `${touch.clientY}px`;
    target?.classList.remove('is-drop-target');
    const hit = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('[data-pitch-slot="true"]');
    target = hit && root.contains(hit) && canMove(pending.slot, hit) ? hit : null;
    target?.classList.add('is-drop-target');
  };
  document.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) { cancel(); return; }
    cancel();
    ignoreClickUntil = 0; // A new gesture is never the previous synthetic click.
    const slot = event.target.closest?.('[data-pitch-slot="true"]');
    if (!slot || !root.contains(slot) || event.target.closest('.slot-card-actions, .slot-card-body button, a, input')) return;
    const entry = getEntry(slot);
    if (!entry?.card || isLocked(entry)) return;
    const touch = event.touches[0];
    pending = { slot, entry, id: touch.identifier, x: touch.clientX, y: touch.clientY };
    timer = setTimeout(() => {
      if (!valid()) { clear(); return; }
      const body = slot.querySelector('.slot-card-body') ?? slot;
      ghost = document.createElement('div');
      ghost.className = 'pitch-touch-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      // Read the rendered face so custom backgrounds and headshots stay in sync.
      for (const [selector, className] of [
        ['.ea-card-background', 'pitch-touch-background'],
        ['.ea-card-portrait', 'pitch-touch-portrait'],
      ]) {
        const source = body.querySelector(selector);
        if (!source) continue;
        const image = document.createElement('img');
        image.className = className;
        image.src = source.currentSrc || source.src;
        image.alt = ''; image.draggable = false;
        ghost.append(image);
      }
      const rating = document.createElement('div'); rating.className = 'pitch-touch-rating';
      for (const selector of ['.ea-card-rating', '.ea-card-position']) {
        const line = document.createElement('span');
        line.textContent = body.querySelector(selector)?.textContent ?? '';
        rating.append(line);
      }
      const name = document.createElement('div'); name.className = 'pitch-touch-name';
      name.textContent = body.querySelector('.ea-card-name')?.textContent ?? pending.entry.card.name ?? '';
      ghost.append(rating, name);
      document.body.append(ghost);
      slot.classList.add('is-dragging');
      onDragStart?.(slot);
      point({ clientX: pending.x, clientY: pending.y });
    }, 220);
  }, { passive: true });
  document.addEventListener('touchmove', event => {
    if (!pending) return;
    if (event.touches.length !== 1 || !valid()) { cancel(); return; }
    const touch = event.touches[0];
    if (touch.identifier !== pending.id) { cancel(); return; }
    if (!ghost) {
      if (Math.hypot(touch.clientX - pending.x, touch.clientY - pending.y) >= 8) clear();
      return;
    }
    // A non-cancelable move means the browser already owns this scroll gesture.
    if (!event.cancelable) { cancel(); return; }
    event.preventDefault();
    point(touch);
  }, { passive: false });
  document.addEventListener('touchend', event => {
    if (!pending) return;
    if (!ghost || event.touches.length || !valid()) { cancel(); return; }
    const touch = [...event.changedTouches].find(t => t.identifier === pending.id);
    if (touch) point(touch);
    const origin = pending.slot, destination = target;
    ignoreClickUntil = Date.now() + 600;
    clear();
    if (touch && destination && canMove(origin, destination)) {
      move(origin, destination);
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
  }, { passive: true });
  document.addEventListener('touchcancel', cancel, { passive: true });
  window.addEventListener('blur', cancel);
  document.addEventListener('click', event => {
    if (Date.now() > ignoreClickUntil || !root.contains(event.target)) return;
    ignoreClickUntil = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  root.addEventListener('contextmenu', event => { if (ghost) event.preventDefault(); });
}
