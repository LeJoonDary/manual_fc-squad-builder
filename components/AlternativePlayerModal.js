import { resetMobileZoom } from '../utils/mobileZoom.js';
import { subscribeLanguage } from '../src/i18n/languageStore';
import { formatSlotPosition } from '../utils/pitchCardLabels.js';
import { createRecommendationControls, recommendationText as text } from './RecommendationControls.js';

export function createAlternativePlayerModal({ load, select, renderCard, getPriceContext = () => ({ totalBudget: 0, maxPrice: null }) }) {
  const dialog = document.createElement('dialog'); dialog.className = 'alternative-dialog swap-player-dialog';
  dialog.setAttribute('aria-labelledby', 'alternative-title');
  const title = document.createElement('h2'); title.id = 'alternative-title';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'swap-modal-close';
  close.textContent = '×';
  const header = document.createElement('header'); header.className = 'swap-modal-header'; header.append(title, close);
  const body = document.createElement('div'); body.className = 'swap-modal-body';
  const controlsHost = document.createElement('section'); controlsHost.className = 'slot-recommendations';
  const results = document.createElement('div'); results.className = 'alternative-results'; results.setAttribute('aria-live', 'polite');
  const more = document.createElement('button'); more.type = 'button'; more.className = 'alternative-load-more swap-secondary-button'; more.hidden = true;
  const footer = document.createElement('div'); footer.className = 'swap-load-more-container'; footer.append(more);
  body.append(controlsHost, results, footer); dialog.append(header, body); document.body.append(dialog);
  let controller, controls, position, currentCard, sort, slotMaxPrice;
  const invalidate = () => controller?.abort();
  close.onclick = () => dialog.close();
  dialog.addEventListener('close', () => { invalidate(); controls?.dispose(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  const state = () => ({ sort, slotMaxPrice });
  function renderControls() {
    controls?.dispose();
    title.textContent = text(`대체 선수 추천 (${formatSlotPosition(position)})`, `Replacement Recommendations (${formatSlotPosition(position)})`);
    close.setAttribute('aria-label', text('교체 모달 닫기', 'Close swap modal'));
    more.textContent = text('더 보기 (20명)', 'Load More (20 Players)');
    controls = createRecommendationControls({ mode: 'replace', sort, ...getPriceContext(position, state()),
      onInvalidate: invalidate,
      onSort: value => { sort = value; renderControls(); refresh(); },
      onPrice: value => { slotMaxPrice = value; renderControls(); refresh(); },
    });
    controlsHost.replaceChildren(controls.element);
  }
  async function refresh() {
    invalidate(); const request = new AbortController(); controller = request;
    const selectedState = state();
    more.hidden = true; more.onclick = null; results.setAttribute('aria-busy', 'true');
    const loading = document.createElement('div'); loading.className = 'alternative-loading recommendation-loading'; loading.setAttribute('role', 'status');
    const spinner = document.createElement('span'); spinner.className = 'alternative-spinner'; spinner.setAttribute('aria-hidden', 'true');
    loading.append(spinner, document.createTextNode(text('맞춤 추천 선수를 찾는 중…', 'Finding recommended players…'))); results.replaceChildren(loading);
    try {
      const suggestions = await load(position, request.signal, currentCard, selectedState);
      if (request.signal.aborted) return;
      results.replaceChildren(); results.setAttribute('aria-busy', 'false');
      if (!suggestions.length) results.textContent = text('조건에 맞는 추천 선수가 없습니다. 가격이나 설정을 변경해 보세요.', 'No recommendations match. Try changing the price or settings.');
      let offset = 0, selecting = false;
      const appendPage = () => {
        const page = suggestions.slice(offset, offset + 20); offset += page.length;
        for (const suggestion of page) {
          const activate = async () => {
            if (selecting || request.signal.aborted) return;
            selecting = true;
            try {
              await select(position, suggestion.card, request.signal, suggestion.bestManager, selectedState);
              if (!request.signal.aborted) dialog.close();
            } catch (error) {
              if (!request.signal.aborted) {
                selecting = false; more.hidden = true;
                results.textContent = text('선수를 교체하지 못했습니다: ', 'Unable to replace player: ') + error.message;
              }
            }
          };
          results.append(renderCard(suggestion.card, activate, suggestion));
        }
        more.hidden = offset >= suggestions.length;
      };
      more.onclick = appendPage; appendPage();
    } catch (error) {
      if (!request.signal.aborted) {
        results.setAttribute('aria-busy', 'false');
        results.textContent = text('추천 선수를 불러오지 못했습니다: ', 'Unable to load alternatives: ') + error.message;
      }
    }
  }
  subscribeLanguage(() => { if (dialog.isConnected && dialog.open) { renderControls(); refresh(); } });
  return {
    async open(nextPosition, nextCard) {
      invalidate(); position = nextPosition; currentCard = nextCard; sort = 'maintain_chem'; slotMaxPrice = undefined;
      renderControls(); resetMobileZoom(); if (!dialog.open) dialog.showModal();
      await refresh();
    },
  };
}
