import { getLanguage, subscribeLanguage } from '../src/i18n/languageStore';
import { resetMobileZoom } from '../utils/mobileZoom.js';
const text = (ko, en) => getLanguage() === 'ko' ? ko : en;
export async function copyShareText(value, parent = document.body) {
  try { await navigator.clipboard.writeText(value); return true; } catch { /* Older/insecure browsers. */ }
  const area = document.createElement('textarea'); area.value = value;
  area.style.cssText = 'position:fixed;left:-9999px;top:0';
  const focused = document.activeElement; parent.append(area); area.select();
  try { return document.execCommand('copy'); } catch { return false; }
  finally { area.remove(); focused?.focus(); }
}
export function createSquadShareModal({ mount, getCurrent, savePng }) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'squad-share-trigger squad-slot-main';
  mount.append(button);
  const dialog = document.createElement('dialog'); dialog.className = 'squad-share-dialog';
  dialog.setAttribute('aria-labelledby', 'squad-share-title');
  const header = document.createElement('header');
  const title = document.createElement('h2'); title.id = 'squad-share-title';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.className = 'share-close';
  header.append(title, close);
  const brand = document.createElement('p'); brand.className = 'share-brand'; brand.textContent = 'MetaXI · FC 27';
  const summary = document.createElement('div'); summary.className = 'share-summary';
  const url = document.createElement('input'); url.type = 'text'; url.readOnly = true; url.className = 'share-url';
  url.onclick = () => url.select(); url.onfocus = () => url.select();
  const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'share-copy';
  const png = document.createElement('button'); png.type = 'button'; png.className = 'share-save-png';
  png.hidden = !savePng;
  const pngLabel = document.createElement('span');
  png.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>';
  png.append(pngLabel);
  let isExportingPng = false;
  function renderPng() {
    png.disabled = isExportingPng;
    pngLabel.textContent = isExportingPng ? text('PNG 저장 중...', 'Saving PNG...') : text('PNG 이미지 저장', 'Save PNG');
  }
  const copySummary = document.createElement('button'); copySummary.type = 'button'; copySummary.className = 'share-copy-summary';
  const feedback = document.createElement('p'); feedback.className = 'share-feedback'; feedback.setAttribute('role', 'status');
  const note = document.createElement('p'); note.className = 'share-note';
  dialog.append(header, brand, summary, url, png, copy, copySummary, feedback, note); document.body.append(dialog);
  let snapshot, timers = [], epoch = 0;
  const clear = () => { epoch++; timers.forEach(clearTimeout); timers = []; };
  function render() {
    clear();
    renderPng();
    button.textContent = text('🔗 공유', '🔗 Share'); button.disabled = !getCurrent().count;
    title.textContent = text('스쿼드 링크 공유', 'Share Squad Link'); close.setAttribute('aria-label', text('공유 모달 닫기', 'Close share dialog'));
    url.setAttribute('aria-label', text('스쿼드 공유 링크', 'Squad share URL'));
    copy.textContent = text('링크 복사', 'Copy Link'); copySummary.textContent = text('요약 + 링크 복사', 'Copy Summary + Link');
    copy.disabled = false; copySummary.disabled = false;
    copy.classList.remove('is-copied'); copySummary.classList.remove('is-copied'); feedback.textContent = '';
    note.textContent = text('이 링크를 열면 포메이션, 선수, 잠금/보유 설정, 감독까지 그대로 복원됩니다.', 'Opening this link restores the exact formation, players, lock/owned flags, and manager.');
    if (!snapshot) return;
    url.value = snapshot.url; summary.replaceChildren();
    const values = [
      [text('포메이션', 'Formation'), snapshot.formation],
      [text('팀 케미스트리', 'Team Chemistry'), `${snapshot.chemistry} / 33`],
      [text('총 소요 비용', 'Total Cost'), `${snapshot.cost.toLocaleString('en-US')} C`],
      [text('평균 OVR', 'Average OVR'), snapshot.averageOvr.toFixed(1)],
      [text('선수 수', 'Players'), `${snapshot.count} / 11`],
    ];
    values.forEach(([label, value], i) => {
      const cell = document.createElement('div'); const caption = document.createElement('span'); caption.textContent = label;
      const number = document.createElement('strong'); number.textContent = value;
      if (i === 1 && snapshot.chemistry === 33) number.className = 'is-perfect';
      cell.append(caption, number); summary.append(cell);
    });
  }
  async function copyValue(target, withSummary) {
    if (!snapshot || target.disabled) return;
    target.disabled = true;
    const ticket = epoch, original = target.textContent;
    const line = text(`[MetaXI FC 27 스쿼드] ${snapshot.formation} | 케미 ${snapshot.chemistry}/33 | ${snapshot.cost.toLocaleString('en-US')} C`,
      `[MetaXI FC 27 Squad] ${snapshot.formation} | ${snapshot.chemistry}/33 Chem | ${snapshot.cost.toLocaleString('en-US')} C`);
    const success = await copyShareText(withSummary ? `${line}\n${snapshot.url}` : snapshot.url, dialog);
    if (ticket !== epoch || !dialog.open) return;
    if (!success) { target.disabled = false; feedback.textContent = text('복사하지 못했습니다. 링크를 선택해 직접 복사해 주세요.', 'Could not copy. Select the link and copy it manually.'); return; }
    target.textContent = text('✅ 복사 완료!', '✅ Copied!'); target.classList.add('is-copied');
    timers.push(setTimeout(() => { target.disabled = false; target.textContent = original; target.classList.remove('is-copied'); }, 2000));
  }
  copy.onclick = () => copyValue(copy, false); copySummary.onclick = () => copyValue(copySummary, true);
  png.onclick = async () => {
    if (!savePng || isExportingPng) return;
    const ticket = epoch;
    isExportingPng = true; renderPng(); feedback.textContent = '';
    try {
      await savePng(getCurrent());
      if (ticket === epoch && dialog.open) feedback.textContent = text('스쿼드 PNG가 저장되었습니다.', 'Squad PNG saved.');
    } catch (error) {
      console.error('[Squad PNG] Export failed:', error);
      if (ticket === epoch && dialog.open) feedback.textContent = text('PNG를 저장하지 못했습니다. 이미지 서버의 접근 제한 또는 네트워크 문제일 수 있습니다. 잠시 후 다시 시도해 주세요.', 'Could not save PNG. An image server may block access, or the network may be unavailable. Please try again.');
    } finally { isExportingPng = false; renderPng(); }
  };
  button.onclick = () => { snapshot = getCurrent(); if (!snapshot.count) return; render(); resetMobileZoom(); dialog.showModal(); };
  close.onclick = () => dialog.close(); dialog.addEventListener('close', clear);
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  subscribeLanguage(render); render();
  return { sync: () => { button.disabled = !getCurrent().count; } };
}
