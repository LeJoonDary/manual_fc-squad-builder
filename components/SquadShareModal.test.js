// @vitest-environment jsdom
import { expect, test, vi, afterEach } from 'vitest';
import { createSquadShareModal, copyShareText } from './SquadShareModal';
import { setLanguage } from '../src/i18n/languageStore';
HTMLDialogElement.prototype.showModal=function(){this.open=true;};
HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
afterEach(()=>{vi.useRealTimers();document.body.replaceChildren();});
test('share modal shows summary, copies link/summary, resets feedback and translates',async()=>{
  setLanguage('en',false);vi.useFakeTimers();
  const writeText=vi.fn().mockResolvedValue(undefined);Object.defineProperty(navigator,'clipboard',{value:{writeText},configurable:true});
  const current={url:'https://metaxi.net/?s=test',formation:'4-3-1-2',chemistry:33,cost:174800,averageOvr:89.4,count:11};
  createSquadShareModal({mount:document.body,getCurrent:()=>current});
  document.querySelector('.squad-share-trigger').click();
  expect(document.querySelector('.is-perfect').textContent).toBe('33 / 33');
  const copy=document.querySelector('.share-copy');copy.click();await vi.advanceTimersByTimeAsync(0);
  expect(writeText).toHaveBeenLastCalledWith(current.url);expect(copy.textContent).toBe('✅ Copied!');
  await vi.advanceTimersByTimeAsync(2000);expect(copy.textContent).toBe('Copy Link');
  document.querySelector('.share-copy-summary').click();await vi.advanceTimersByTimeAsync(0);
  expect(writeText).toHaveBeenLastCalledWith('[MetaXI FC 27 Squad] 4-3-1-2 | 33/33 Chem | 174,800 C\n'+current.url);
  setLanguage('ko',false);expect(document.querySelector('h2').textContent).toBe('스쿼드 링크 공유');
});
test('clipboard fallback uses a temporary textarea and cleans up',async()=>{
  Object.defineProperty(navigator,'clipboard',{value:{writeText:vi.fn().mockRejectedValue(new Error('denied'))},configurable:true});
  document.execCommand=vi.fn(()=>true);
  expect(await copyShareText('share text')).toBe(true);expect(document.execCommand).toHaveBeenCalledWith('copy');
  expect(document.querySelector('textarea')).toBeNull();
});
test('empty pitch disables sharing',()=>{
  createSquadShareModal({mount:document.body,getCurrent:()=>({count:0})});
  expect(document.querySelector('.squad-share-trigger').disabled).toBe(true);
});
