// Read-only UI checks against local Vite and a disposable Chromium session on 9224.
import assert from 'node:assert/strict';
const targets = await (await fetch('http://127.0.0.1:9224/json/list')).json();
const socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0; const pending = new Map();
socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } });
async function send(method, params = {}) {
  const next = ++id; const promise = new Promise(resolve => pending.set(next, resolve));
  socket.send(JSON.stringify({ id: next, method, params })); const message = await promise;
  if (message.error) throw new Error(JSON.stringify(message.error)); return message.result;
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
const frame = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
async function waitFor(expression) {
  for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(`Timed out: ${expression}`);
}
try {
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await waitFor(`Boolean(document.querySelector('.modal-affiliation-trigger')) || Boolean(document.querySelector('.tactical-roles-trigger'))`);
  await waitFor(`document.querySelectorAll('#club-picker .nation-options button').length > 3`);
  for (const language of ['en', 'ko']) {
    await evaluate(`document.querySelector('.language-toggle button[lang="${language}"]').click(); document.querySelector('.slot[data-position="LS"]').click();`);
    for (const width of [1280, 768, 375]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }); await frame();
      const layout = await evaluate(`(() => {
        const rect = node => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; };
        return { focused: document.activeElement.id === 'modal-player-search-input', search: rect(document.querySelector('#modal-player-search-input')), tabs: [...document.querySelectorAll('#player-modal .recommendation-tabs button')].map(rect),
          prices: [...document.querySelector('#player-modal .recommendation-prices').children].map(rect),
          affiliation: rect(document.querySelector('.modal-affiliation-trigger')), panel: rect(document.querySelector('#player-modal .modal-panel')) };
      })()`);
      assert.equal(new Set(layout.tabs.map(tab => tab.top)).size, 1);
      if (width < 768) {
        assert.equal(new Set(layout.prices.map(price => price.top)).size, 2);
        assert.equal(new Set(layout.prices.slice(0, 4).map(price => price.top)).size, 1);
        assert.equal(new Set(layout.prices.slice(4).map(price => price.top)).size, 1);
        assert.equal(new Set(layout.prices.map(price => price.height)).size, 1);
      }
      const aligned = await evaluate(`(() => {
        const trigger = document.querySelector('.modal-affiliation-trigger');
        const reset = document.querySelector('.modal-affiliation-clear');
        const label = trigger.textContent;
        const hidden = reset.hidden;
        trigger.textContent = label + ' (3)'; reset.hidden = false;
        const measurements = [document.querySelector('#modal-player-search-input'), trigger, reset].map(node => {
          const r = node.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, height: r.height, width: r.width, right: r.right, radius: getComputedStyle(node).borderRadius };
        });
        trigger.textContent = label; reset.hidden = hidden;
        return measurements;
      })()`);
      assert(aligned.every(item => item.height === 44 && item.radius === '11px'));
      assert.equal(new Set(aligned.map(item => item.top)).size, 1);
      assert.equal(new Set(aligned.map(item => item.bottom)).size, 1);
      assert.equal(aligned[2].width, 44);
      assert(aligned[0].width > 0 && aligned[2].right <= layout.panel.right);
      assert(!layout.focused);
      assert(layout.affiliation.left >= layout.search.right);
      assert(layout.affiliation.top < layout.search.bottom && layout.affiliation.bottom > layout.search.top);
      await evaluate(`document.querySelector('.modal-affiliation-trigger').click()`); await frame();
      const popover = await evaluate(`(() => { const r = document.querySelector('#modal-affiliation-popover').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, open: document.querySelector('#modal-affiliation-popover').matches(':popover-open') }; })()`);
      assert(popover.open);
      assert(popover.left >= layout.panel.left && popover.right <= layout.panel.right);
      assert(popover.top >= layout.panel.top && popover.bottom <= layout.panel.bottom);
      console.log(JSON.stringify({ language, width, metaRows: 1, priceRows: new Set(layout.prices.map(price => price.top)).size, popover }));
      await evaluate(`document.querySelector('#modal-affiliation-popover header button').click()`);
    }
    await evaluate(`document.querySelector('#player-modal .modal-close').click()`);
  }
  for (const surface of ['modal', 'players']) {
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    if (surface === 'modal') await evaluate(`document.querySelector('.slot[data-position="LS"]').click(); document.querySelector('.modal-affiliation-trigger').click(); document.querySelector('#modal-club-picker summary').click()`);
    else await evaluate(`document.querySelector('.nav-tab[data-tab="players"]').click(); document.querySelector('[data-filter-accordion="affiliation"]').click(); document.querySelector('#club-picker summary').click()`);
    await frame();
    for (const name of ['Real Madrid', 'Arsenal', 'FC Barcelona']) {
      const rows = await evaluate(`(() => { const picker = document.querySelector('${surface === 'modal' ? '#modal-club-picker' : '#club-picker'}'); const input = picker.querySelector('input'); input.value = '${name}'; input.dispatchEvent(new Event('input')); return [...picker.querySelectorAll('[data-affiliation-id]')].filter(button => button.dataset.affiliationId).map(button => ({ id: button.dataset.affiliationId, league: button.querySelector('.club-option-league')?.textContent, women: Boolean(button.querySelector('.women-league-badge')) })); })()`);
      assert(rows.some(row => row.women) && rows.some(row => !row.women));
      assert(rows.every(row => row.league)); assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
      console.log(JSON.stringify({ surface, name, rows }));
    }
    if (surface === 'modal') await evaluate(`document.querySelector('#player-modal .modal-close').click()`);
  }
  if (process.argv.includes('--close-browser')) await send('Browser.close');
} finally { socket.close(); }
