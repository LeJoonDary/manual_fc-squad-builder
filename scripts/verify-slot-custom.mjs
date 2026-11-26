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
  console.log(await evaluate(`({saved:localStorage.getItem('metaxi_squad_state_v1'), slots:[...document.querySelectorAll('.slot.occupied')].map(s=>({pos:s.dataset.position,rating:s.querySelector('.ea-card-rating')?.textContent})), title:document.title})`));
  throw new Error(`Timed out: ${expression}`);
}
try {
  await send('Page.enable');
  await send('Runtime.enable');
  socket.addEventListener('message', event => { const m=JSON.parse(event.data); if(m.method === 'Runtime.consoleAPICalled' && m.params.type === 'warning') console.log(m.params.args.map(a=>a.value ?? a.description)); if(m.method === 'Runtime.exceptionThrown') console.log(m.params.exceptionDetails.exception?.description); });
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await waitFor(`Boolean(document.querySelector('.tactical-roles-trigger'))`);
  const seed = await send('Page.addScriptToEvaluateOnNewDocument', {source: `localStorage.setItem('metaxi_squad_state_v1', JSON.stringify({version:1, formation:'4-3-1-2', budget:100000, manager:{league:'Premier League',leagueId:'3',nation:'England',nationId:'1'}, players:{LS:{card:{id:987654321, name:'Custom QA', version:'gold', image_url:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22/%3E', overall:80, price:1000, primary_position:'ST', position:'ST', sm:3, wf:3, nation_id:1, league_id:3, club_id:32, player_stats:{pac:80,sho:81,pas:82,dri:83,def:84,phy:85}}, customOverrides:{forceFullChem:true,addedPositions:['CAM'],overall:95,faceStats:{pac:99},sm:5,wf:5},isLocked:true},LB:{card:{id:987654322,name:'LB QA',position:'LB',primary_position:'LB',secondary_positions:['LM','RB'],overall:80,price:10},customOverrides:{forceFullChem:true},isLocked:true}}}));`});
  await evaluate(`window.addEventListener('pagehide', event => event.stopImmediatePropagation(), {capture:true, once:true})`);
  await send('Page.reload');
  await new Promise(resolve => setTimeout(resolve, 300));
  await waitFor(`document.querySelector('.slot[data-position="LS"] .ea-card-rating')?.textContent === '95'`);
  await send('Page.removeScriptToEvaluateOnNewDocument', {identifier:seed.identifier});
  assert(await evaluate(`document.querySelector('.slot[data-position="LS"]').classList.contains('is-locked')`));
  await evaluate(`document.querySelector('.language-toggle button[lang="en"]').click(); document.querySelector('.slot[data-position="LS"]').click()`);
  await waitFor(`Boolean(document.querySelector('.slot-custom-panel'))`);
  assert(await evaluate(`document.querySelector('#player-modal').hidden && !document.querySelector('#player-detail-modal').hidden`));
  await evaluate(`document.querySelectorAll('.slot-custom-panel details')[1].open = true`);
  await waitFor(`document.querySelectorAll('.slot-custom-skins img').length > 1`);
  const skins = await evaluate(`[...document.querySelectorAll('.slot-custom-skins button')].map(b=>b.textContent)`);
  assert.equal(skins[0], 'Original'); assert.equal(skins[1], 'Gold'); assert(!skins.some(s=>/totw|silver|bronze/i.test(s)));
  await evaluate(`document.querySelectorAll('.slot-custom-skins button')[1].click()`);
  assert(await evaluate(`JSON.parse(localStorage.getItem('metaxi_squad_state_v1')).players.LS.customOverrides.versionLabel.toLowerCase() === 'gold'`));
  assert(await evaluate(`document.querySelector('[role="switch"]').tagName === 'BUTTON' && document.querySelector('[role="switch"]').getAttribute('aria-checked') === 'true'`));
  await evaluate(`document.querySelectorAll('.slot-custom-skins button')[2].click()`);
  assert(await evaluate(`Boolean(document.querySelector('.slot[data-position="LS"] .ea-card-portrait--headshot'))`));
  for (const width of [1280,375]) {
    await send('Emulation.setDeviceMetricsOverride', {width,height:900,deviceScaleFactor:1,mobile:false}); await frame();
    const layout = await evaluate(`(() => {const grid=document.querySelector('.slot-custom-skins'), panel=document.querySelector('.player-detail-panel'); return {height:grid.getBoundingClientRect().height, columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length, overflow:panel.scrollWidth > panel.clientWidth};})()`);
    assert(layout.height <= 192); assert.equal(layout.columns,width===375?4:8); assert(!layout.overflow);
    console.log(JSON.stringify({width,...layout,skins:skins.length}));
  }
  await evaluate(`document.querySelector('#player-detail-close').click(); document.querySelector('.slot[data-position="LS"] .lock-player').click()`);
  assert(await evaluate(`document.querySelector('#player-detail-modal').hidden && !document.querySelector('.slot[data-position="LS"]').classList.contains('is-locked')`));
  await send('Page.reload');
  await new Promise(resolve => setTimeout(resolve, 300));
  await waitFor(`document.querySelector('.slot[data-position="LS"] .ea-card-rating')?.textContent === '95'`);
  assert(await evaluate(`!document.querySelector('.slot[data-position="LS"]').classList.contains('is-locked')`));
  assert(await evaluate(`document.querySelector('.slot[data-position="LS"] .ea-card-background')?.src === JSON.parse(localStorage.getItem('metaxi_squad_state_v1')).players.LS.customOverrides.backgroundUrl`));
  assert(await evaluate(`Boolean(document.querySelector('.slot[data-position="LS"] .ea-card-portrait--headshot'))`));
  const overlap = await evaluate(`(() => {const slot=document.querySelector('.slot[data-position="LS"]'), badge=slot.querySelector('.pitch-custom-badge').getBoundingClientRect(); return [...slot.querySelectorAll('.ea-card-stats b')].some(node=>{const r=node.getBoundingClientRect();return badge.left<r.right && badge.right>r.left && badge.top<r.bottom && badge.bottom>r.top;});})()`);
  assert(!overlap);
  console.log('Reload preserved explicit unlock; headshot framing and badge/stat separation passed.');
  const png = await evaluate(`(async () => { const {createSquadPng}=await import('/utils/squadImage.js'); const blob=await createSquadPng(document.querySelector('.pitch')); const bytes=new Uint8Array(await blob.arrayBuffer()); return {size:blob.size,type:blob.type,signature:[...bytes.slice(0,8)]}; })()`);
  assert.equal(png.type, 'image/png'); assert(png.size > 10000); assert.deepEqual(png.signature,[137,80,78,71,13,10,26,10]); console.log(JSON.stringify({png}));

  const moves = await evaluate(`(() => {
    [...document.querySelectorAll('#formation-menu button')].find(b=>b.textContent==='4-4-2').click();
    const slot=pos=>document.querySelector('.slot[data-position="'+pos+'"]');
    const transfer=new DataTransfer();
    const drag=(pos,type)=>slot(pos).dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:transfer}));
    drag('LB','dragstart');
    const highlighted=[...document.querySelectorAll('.pitch-compatible')].map(s=>s.dataset.position).sort();
    drag('LCB','drop'); const blocked=slot('LB').dataset.cardId==='987654322';
    drag('LB','dragstart'); drag('RB','drop'); drag('RB','dragend');
    const moved=slot('RB').dataset.cardId==='987654322' && !slot('LB').classList.contains('occupied') && slot('RB').classList.contains('is-locked') && Boolean(slot('RB').querySelector('.pitch-custom-badge'));
    slot('RB').querySelector('.remove-player').click();
    return {highlighted,blocked,moved,removed:!slot('RB').classList.contains('occupied'),detailClosed:document.querySelector('#player-detail-modal').hidden};
  })()`);
  assert.deepEqual(moves.highlighted,['LM','RB']); assert(moves.blocked && moves.moved && moves.removed && moves.detailClosed); console.log(JSON.stringify(moves));
  await evaluate(`document.querySelector('#clear-squad').click()`);
  assert(await evaluate(`document.querySelectorAll('.slot.occupied').length === 0 && localStorage.getItem('metaxi_squad_state_v1') === null`));
} finally {
  if (process.argv.includes('--close-browser')) await send('Browser.close').catch(()=>{});
  socket.close();
}
