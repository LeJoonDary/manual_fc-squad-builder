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
  await send('Emulation.setDeviceMetricsOverride',{width:375,height:740,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  const seed = await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('metaxi_squad_state_v1',JSON.stringify({version:1,formation:'4-3-1-2',players:{LS:{card:{id:987654321,name:'Touch QA',position:'ST',primary_position:'ST',overall:80,price:100,secondary_positions:['CAM']},isLocked:false}},manager:null}));`});
  await send('Page.navigate',{url:'http://127.0.0.1:5173/'});
  await waitFor(`Boolean(document.querySelector('.slot[data-position="LS"] .ea-card-rating'))`);
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:seed.identifier});
  const state=await evaluate(`({coarse:matchMedia('(pointer: coarse)').matches,draggable:document.querySelector('.slot[data-position="LS"]').draggable,touch:getComputedStyle(document.querySelector('.pitch')).touchAction,overflow:getComputedStyle(document.body).overflowY,viewport:document.querySelector('meta[name="viewport"]').content})`);
  assert(state.coarse && !state.draggable && state.touch==='auto' && state.overflow==='auto'); assert(!/user-scalable=no|maximum-scale=1/.test(state.viewport)); console.log(state);
  const start=await evaluate(`scrollY`);
  const point=await evaluate(`(()=>{const r=document.querySelector('.slot[data-position="LS"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});
  for(let i=1;i<=8;i++) { await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:point.y-i*12,id:1}]}); await new Promise(resolve=>setTimeout(resolve,25)); }
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await new Promise(resolve=>setTimeout(resolve,200));
  const after=await evaluate(`scrollY`); console.log({start,after,point, layout:await evaluate(`({scrollHeight:document.documentElement.scrollHeight,clientHeight:document.documentElement.clientHeight,bodyHeight:document.body.scrollHeight,hit:document.elementFromPoint(${point.x},${point.y})?.outerHTML.slice(0,150)})`)}); assert(after>start);
  await evaluate(`window.scrollTo(0,0); document.querySelector('.explore-mobile-toggle').click()`); await frame();
  assert(await evaluate(`getComputedStyle(document.querySelector('.explore-backdrop')).pointerEvents==='none' && getComputedStyle(document.body).overflowY==='auto'`));
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:140,y:350,id:1},{x:220,y:350,id:2}]});
  for(let i=1;i<=10;i++) { await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:140-i*5,y:350,id:1},{x:220+i*5,y:350,id:2}]}); await new Promise(resolve=>setTimeout(resolve,25)); }
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await new Promise(resolve=>setTimeout(resolve,150));
  const scale=await evaluate(`visualViewport.scale`); console.log({pinchScale:scale}); assert(scale>1);
  await evaluate(`document.querySelector('.explore-panel').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  const panBefore=await evaluate(`({x:visualViewport.pageLeft,y:visualViewport.pageTop})`);
  const panPoint=await evaluate(`({x:visualViewport.width-10,y:visualViewport.height-10})`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...panPoint,id:1}]});
  for(let i=1;i<=9;i++) { await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:panPoint.x-i*9,y:panPoint.y-i*9,id:1}]}); await new Promise(resolve=>setTimeout(resolve,25)); }
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await new Promise(resolve=>setTimeout(resolve,150));
  const panAfter=await evaluate(`({x:visualViewport.pageLeft,y:visualViewport.pageTop})`); console.log({panBefore,panAfter}); assert(panBefore.x!==panAfter.x || panBefore.y!==panAfter.y);
  await evaluate(`document.querySelector('.explore-panel button').click()`);
  // Close the drawer through Escape without touching the viewport policy.
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await evaluate(`document.querySelector('.squad-workspace').classList.remove('explore-drawer-open'); document.querySelector('.slot[data-position="LS"]').click()`);
  assert(await evaluate(`!document.querySelector('#player-detail-modal').hidden && getComputedStyle(document.body).overflowY==='hidden'`));
  await evaluate(`document.querySelector('#player-detail-close').click(); document.querySelector('.slot[data-position="RS"]').click()`);
  assert(await evaluate(`!document.querySelector('#player-modal').hidden`));
  await evaluate(`document.querySelector('#player-modal [data-close-modal]').click()`);
  assert(await evaluate(`getComputedStyle(document.body).overflowY==='auto'`));
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false}); await frame();
  assert(await evaluate(`document.querySelector('.slot[data-position="LS"]').draggable`));
  await evaluate(`document.querySelector('.slot[data-position="LS"] .lock-player').click()`);
  assert(await evaluate(`!document.querySelector('.slot[data-position="LS"]').draggable`));
  const desktopMove=await evaluate(`(()=>{const get=p=>document.querySelector('.slot[data-position="'+p+'"]'); get('LS').querySelector('.lock-player').click(); const transfer=new DataTransfer(); get('LS').dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:transfer})); const highlighted=get('CAM').classList.contains('pitch-compatible'); get('CAM').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer})); get('LS').dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer})); return highlighted && get('CAM').classList.contains('occupied') && !get('LS').classList.contains('occupied');})()`);
  assert(desktopMove);
  await send('Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5}); await frame();
  assert(await evaluate(`!document.querySelector('.slot[data-position="CAM"]').draggable && getComputedStyle(document.body).overflowY === 'auto'`));
  console.log('Touch scroll/pinch/pan, modal taps, desktop valid-position drag, locks and wide touch tablet passed.');
} finally { await send('Browser.close').catch(()=>{}); socket.close(); }
