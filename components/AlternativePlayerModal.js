export function createAlternativePlayerModal({ load, select, renderCard }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'alternative-dialog swap-player-dialog';
  dialog.setAttribute('aria-labelledby', 'alternative-title');
  const title = document.createElement('h2');
  title.id = 'alternative-title';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'swap-modal-close';
  close.setAttribute('aria-label', 'Close swap modal');
  close.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  const results = document.createElement('div');
  results.className = 'alternative-results';
  results.setAttribute('aria-live', 'polite');
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'alternative-load-more swap-secondary-button';
  more.textContent = 'Load More (8 Players)';
  more.hidden = true;
  const footer = document.createElement('div');
  footer.className = 'swap-load-more-container';
  footer.append(more);
  const header = document.createElement('header');
  header.className = 'swap-modal-header';
  header.append(title, close);
  const body = document.createElement('div');
  body.className = 'swap-modal-body';
  body.append(results, footer);
  dialog.append(header, body);
  document.body.append(dialog);
  let controller;
  close.onclick = () => dialog.close();
  dialog.addEventListener('close', () => controller?.abort());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  return {
    async open(position, currentCard) {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      title.textContent = 'Alternative Players (Maintains Target Chem)';
      results.replaceChildren();
      more.hidden = true;
      more.onclick = null;
      results.setAttribute('aria-busy', 'true');
      const loading = document.createElement('div');
      loading.className = 'alternative-loading';
      loading.setAttribute('role', 'status');
      const spinner = document.createElement('span');
      spinner.className = 'alternative-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      loading.append(spinner, document.createTextNode('Calculating chemistry & finding alternatives...'));
      results.append(loading);
      dialog.showModal();
      try {
        const suggestions = await load(position, request.signal, currentCard);
        if (request.signal.aborted) return;
        results.replaceChildren();
        results.setAttribute('aria-busy', 'false');
        if (!suggestions.length) results.textContent = 'No eligible alternatives match your squad settings.';
        let selecting = false;
        let offset = 0;
        const appendPage = () => {
        const page = suggestions.slice(offset, offset + 8);
        offset += page.length;
        for (const suggestion of page) {
          const { card } = suggestion;
          const activate = async () => {
            if (selecting || request.signal.aborted) return;
            selecting = true;
            try {
              await select(position, card, request.signal, suggestion.bestManager);
              if (!request.signal.aborted) dialog.close();
            } catch (error) {
              if (!request.signal.aborted) {
                more.hidden = true;
                results.textContent = `Unable to replace player: ${error.message}. Close and try again.`;
              }
            }
          };
          const article = renderCard(card, activate);
          results.append(article);
        }
        more.hidden = offset >= suggestions.length;
        };
        more.onclick = appendPage;
        appendPage();
      } catch (error) {
        if (!request.signal.aborted) {
          results.setAttribute('aria-busy', 'false');
          results.textContent = `Unable to load alternatives: ${error.message}. Close and try again.`;
        }
      }
    },
  };
}

