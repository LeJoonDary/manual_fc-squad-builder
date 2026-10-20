export function createSwapConflictModal({ rebuild }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'alternative-dialog swap-conflict-dialog';
  dialog.setAttribute('aria-labelledby', 'swap-conflict-title');
  const title = document.createElement('h2');
  title.id = 'swap-conflict-title';
  title.textContent = 'Squad Setting Conflict';
  const body = document.createElement('div');
  const build = document.createElement('button');
  build.type = 'button';
  build.className = 'swap-rebuild-button';
  build.textContent = 'Re-build Squad';
  build.onclick = () => { dialog.close(); rebuild(); };
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'swap-secondary-button';
  close.textContent = 'Close';
  close.onclick = () => dialog.close();
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'swap-modal-close';
  dismiss.setAttribute('aria-label', 'Close conflict modal');
  dismiss.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  dismiss.onclick = () => dialog.close();
  const actions = document.createElement('div');
  actions.className = 'swap-conflict-actions';
  actions.append(build, close);
  dialog.append(title, dismiss, body, actions);
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.body.append(dialog);
  return {
    open(conflicts) {
      body.replaceChildren();
      for (const kind of conflicts) {
        const message = document.createElement('p');
        message.textContent = `Your squad already contains ${kind === 'Icon' ? 'an' : 'a'} ${kind} card. To apply the 'Exclude ${kind === 'Hero' ? 'Heroes' : 'Icons'}' rule, please re-run [Auto Build Squad] or replace the ${kind} card first.`;
        body.append(message);
      }
      dialog.showModal();
    },
  };
}
