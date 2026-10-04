// Batch cards rendered in the same turn, avoiding one database request per card.
export function createCardReviewButtons(db, openReview) {
  const pending = new Map();
  let scheduled = false;

  async function flush() {
    scheduled = false;
    const entries = [...pending.entries()];
    pending.clear();
    for (let offset = 0; offset < entries.length; offset += 50) {
      const batch = entries.slice(offset, offset + 50);
      try {
        const { data, error } = await db.from('card_reviews')
          .select('card_id,youtube_video_id,title').in('card_id', batch.map(([id]) => id));
        if (error) continue;
        const reviews = new Map((data ?? []).map(row => [String(row.card_id), row]));
        for (const [id, buttons] of batch) {
          const review = reviews.get(id);
          if (!review || !/^[\w-]{11}$/.test(review.youtube_video_id)) continue;
          for (const button of buttons) {
            button.hidden = false;
            button.addEventListener('click', event => {
              event.stopPropagation();
              openReview(review);
            });
          }
        }
      } catch { /* Optional reviews must never interrupt card rendering. */ }
    }
  }

  return function createReviewButton(card, { compact = false } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `card-review-button${compact ? ' is-compact' : ''}`;
    button.textContent = compact ? '▶' : '▶ Review';
    button.title = 'Gameplay Review';
    button.setAttribute('aria-label', `Gameplay Review${card.name ? ` · ${card.name}` : ''}`);
    button.hidden = true;
    button.draggable = false;
    button.addEventListener('dragstart', event => {
      event.preventDefault();
      event.stopPropagation();
    });
    // Prevent card selection, keyboard activation and squad dragging.
    for (const type of ['keydown', 'keyup', 'pointerdown', 'mousedown', 'dblclick']) {
      button.addEventListener(type, event => event.stopPropagation());
    }
    if (db && card.id != null) {
      const id = String(card.id);
      if (!pending.has(id)) pending.set(id, []);
      pending.get(id).push(button);
      if (!scheduled) { scheduled = true; queueMicrotask(flush); }
    }
    return button;
  };
}
