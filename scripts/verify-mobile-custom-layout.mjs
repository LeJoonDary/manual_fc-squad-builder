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
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  const seed = await send('Page.addScriptToEvaluateOnNewDocument', {source: `localStorage.setItem('metaxi_squad_state_v1', JSON.stringify({version:1, formation:'4-3-1-2', budget:100000, manager:{league:'Premier League',leagueId:'3',nation:'England',nationId:'1'}, players:{LS:{card:{id:987654321, name:'Custom QA', version:'gold', image_url:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22/%3E', overall:80, price:1000, primary_position:'ST', position:'ST', sm:3, wf:3, nation_id:1, league_id:3, club_id:32, player_stats:{pac:80,sho:81,pas:82,dri:83,def:84,phy:85}}, customOverrides:{forceFullChem:true,addedPositions:['CAM'],overall:95,faceStats:{pac:99},sm:5,wf:5},isLocked:true},LB:{card:{id:987654322,name:'LB QA',position:'LB',primary_position:'LB',secondary_positions:['LM','RB'],overall:80,price:10},customOverrides:{forceFullChem:true},isLocked:true}}}));`});
  await send('Page.navigate',{url:'http://127.0.0.1:5173/'});
  await waitFor(`Boolean(document.querySelector('.slot[data-position="LS"] .ea-card-rating'))`);
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:seed.identifier});
  await evaluate(`document.querySelector('.language-toggle button[lang="en"]').click(); document.querySelector('.build-edge-tab').click()`);
  for(const width of [360,390,430]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true}); await frame();
    const layout=await evaluate(`(()=>{const r=document.querySelector('.pitch').getBoundingClientRect(), f=document.querySelector('.pitch-scroll').getBoundingClientRect(), p=document.querySelector('.chemistry-panel').getBoundingClientRect();return {gap:p.top-r.bottom,pitchHeight:r.height,frameHeight:f.height,png:!!document.querySelector('#save-squad-png')};})()`);
    console.log({width,...layout}); assert(layout.gap>=12 && layout.gap<=16); assert(Math.abs(layout.pitchHeight-layout.frameHeight)<2); assert(!layout.png);
    await evaluate(`document.querySelector('.slot[data-position="LS"]').click();document.querySelector('.slot-custom-appearance-toggle').scrollIntoView({block:'center'})`); await frame();
    const point=await evaluate(`(()=>{const r=document.querySelector('.slot-custom-appearance-toggle').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,height:r.height};})()`);
    assert(point.height>=40);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y,id:1}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await frame();
    assert(await evaluate(`document.querySelector('.slot-custom-appearance-toggle').getAttribute('aria-expanded')==='true'`));
    const inputs=await evaluate(`(async()=>{const result=[];for(const input of document.querySelectorAll('.slot-custom-stats input')) {input.scrollIntoView({block:'center'}); await new Promise(resolve=>requestAnimationFrame(resolve));const r=input.getBoundingClientRect();result.push({label:input.getAttribute('aria-label'),numeric:input.inputMode==='numeric',hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===input});input.value=['SM','WF'].includes(input.getAttribute('aria-label'))?'5':'96';input.dispatchEvent(new Event('change'));}return result;})()`);
    assert.equal(inputs.length,9); assert(inputs.every(i=>i.numeric && i.hit)); console.log({width,editable:inputs.map(i=>i.label)});
    assert(await evaluate(`document.querySelector('.slot[data-position="LS"] .ea-card-rating').textContent==='96'`));
    await evaluate(`document.querySelector('#player-detail-close').click()`);
  }
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false}); await frame();
  assert(await evaluate(`!document.querySelector('#save-squad-png') && !!document.querySelector('#clear-squad')`));
  console.log('Desktop PNG removed; mobile accordion taps and all nine stat edits passed.');
} finally {await send('Browser.close').catch(()=>{});socket.close();}
