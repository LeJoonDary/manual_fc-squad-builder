// Run against a local Vite server and a disposable Chromium CDP session on 9224.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const targets = await (await fetch('http://127.0.0.1:9224/json/list')).json();
const socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
});
async function send(method, params = {}) {
  const next = ++id;
  const promise = new Promise(resolve => pending.set(next, resolve));
  socket.send(JSON.stringify({ id: next, method, params }));
  const message = await promise;
  if (message.error) throw new Error(JSON.stringify(message.error));
  return message.result;
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description);
  return result.result.value;
}
try {
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['https://*.supabase.co/*', 'https://*.vercel.com/*'] });
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(`Boolean(document.querySelector('.command-filter'))`)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await evaluate(`document.querySelector('.nav-tab[data-tab="players"]').click()`);
  for (const width of [1280, 1024, 768, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    await evaluate(`(() => { const panel = document.querySelector('[data-filter-section="stats"]'); if (!panel.classList.contains('is-command-open')) panel.querySelector('button').click(); })()`);
    await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    const bounds = await evaluate(`(() => {
      const panel = document.querySelector('#stats-filter-options');
      const rect = panel.getBoundingClientRect();
      const grid = panel.querySelector('.stats-filter-grid');
      panel.scrollTop = panel.scrollHeight;
      const buttons = [...panel.querySelectorAll('.stats-actions button')].map(button => {
        const r = button.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, clickable: button.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) };
      });
      panel.scrollTop = 0;
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length, buttons, overflow: panel.scrollWidth > panel.clientWidth, body: document.body.className, parent: panel.parentElement.className, display: getComputedStyle(panel).display, hidden: document.querySelector('#players-page').hidden };
    })()`);
    assert(bounds.left >= 12 && bounds.right <= width - 12, JSON.stringify({ width, bounds }));
    assert(bounds.bottom <= 900 - 11 && !bounds.overflow, JSON.stringify({ width, bounds }));
    assert.equal(bounds.columns, width >= 1280 ? 3 : width >= 768 ? 2 : 1);
    assert(bounds.buttons.every(button => button.clickable && button.left >= 12 && button.right <= width - 12 && button.bottom <= 888));
    console.log(JSON.stringify({ width, ...bounds }));
    for (const section of ['ovr', 'playstyles', 'miscellaneous']) {
      await evaluate(`document.querySelector('[data-filter-accordion="${section}"]').click()`);
      await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
      const box = await evaluate(`(() => { const panel = document.querySelector('[data-filter-section="${section}"] > .filter-accordion-content'); const rect = panel.getBoundingClientRect(); return { left: rect.left, right: rect.right, bottom: rect.bottom }; })()`);
      assert(box.left >= 12 && box.right <= width - 12 && box.bottom <= 888, JSON.stringify({ width, section, box }));
    }
  }
  await evaluate(`document.querySelector('.nav-tab[data-tab="squad-builder"]').click(); document.querySelector('.tactical-roles-trigger').click();`);
  for (const language of ['en', 'ko']) {
    const result = await evaluate(`(async () => {
      document.querySelector('.tactical-roles-dialog')?.close();
      document.querySelector('.language-toggle button[lang="${language}"]').click();
      await new Promise(resolve => requestAnimationFrame(resolve));
      document.querySelector('.tactical-roles-trigger').click();
      const dialog = document.querySelector('.tactical-roles-dialog');
      dialog.querySelector('[data-tab="stats"]').click();
      return [...dialog.querySelectorAll('.tactical-tabs button')].map(button => ({ text: button.textContent, fits: button.scrollWidth <= button.clientWidth, top: button.getBoundingClientRect().top }));
    })()`);
    assert(result.every(button => button.fits));
    assert.equal(new Set(result.map(button => button.top)).size, 2);
    assert.deepEqual(result.map(button => button.text), language === 'en'
      ? ['🎭 Roles', '⚡ Playstyles', '📈 Detailed Stats', '⚙️ Physical & Body']
      : ['🎭 롤', '⚡ 플레이스타일', '📈 세부 스탯', '⚙️ 피지컬 & 체형']);
    console.log(JSON.stringify({ language, tabs: result }));
  }
  if (process.env.STATS_SCREENSHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(process.env.STATS_SCREENSHOT, Buffer.from(shot.data, 'base64'));
  }
  if (process.argv.includes('--close-browser')) await send('Browser.close');
} finally {
  socket.close();
}
