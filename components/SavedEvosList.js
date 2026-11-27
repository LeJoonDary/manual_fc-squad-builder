import { recommendationText as text } from './RecommendationControls.js';
import { savedEvosStore } from '../utils/savedEvos.js';
import { applySlotCustom, getEffectivePositions } from '../utils/slotCustom.js';
import { PlayerCard } from './PlayerCard.tsx';

export function createSavedEvosList({ query = '', position, unavailable = () => false, select, onDeleted }) {
  const root = document.createElement('div'); root.className = 'saved-evos-list';
  /** @type {string | null} */
  let confirmDeleteId = null;
  const deleteAreas = new Map();
  root.resetDeleteConfirmation = () => { confirmDeleteId = null; deleteAreas.forEach(render => render()); };
  const matches = savedEvosStore.entries.map(item => ({ item, card: applySlotCustom(item.player, item.customOverrides),
    positions: getEffectivePositions({ card: item.player, customOverrides: item.customOverrides }) }))
    .filter(({ card }) => String(card.name ?? card.player_name ?? '').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a,b) => Number(Boolean(position && !a.positions.includes(position))) - Number(Boolean(position && !b.positions.includes(position))) || b.item.savedAt - a.item.savedAt);
  if (!matches.length) {
    const empty = document.createElement('p'); empty.className = 'saved-evos-empty';
    empty.textContent = savedEvosStore.entries.length
      ? text('검색어와 일치하는 커스텀 카드가 없습니다.', 'No saved Custom Cards match your search.')
      : text('저장된 커스텀 카드가 없습니다. 먼저 커스텀 카드를 저장해 주세요.', 'No saved Custom Cards yet. Save a Custom Card first.');
    root.append(empty);
  }
  for (const { item, card, positions } of matches) {
    const mismatch = position && !positions.includes(position), duplicate = unavailable(item);
    const row = document.createElement('article'); row.className = 'saved-evo-row';
    const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'saved-evo-select'; choose.disabled = Boolean(mismatch || duplicate || !select);
    if (duplicate) choose.classList.add('is-in-squad');
    choose.append(PlayerCard({ card }));
    const info = document.createElement('span'); info.className = 'saved-evo-positions';
    info.textContent = positions.join(' / '); info.title = info.textContent;
    const skills = document.createElement('span'); skills.className = 'saved-evo-skills';
    skills.textContent = `SM ${card.sm ?? '—'}★ / WF ${card.wf ?? '—'}★`;
    if (item.customOverrides.forceFullChem) {
      const chem = document.createElement('span'); chem.className = 'saved-evo-chem'; chem.textContent = '3✦'; skills.append(chem);
    }
    if (mismatch || duplicate) {
      const reason = document.createElement('span'); reason.className = duplicate ? 'in-squad-badge' : ''; reason.textContent = duplicate ? text('배치됨', 'In Squad') : text('포지션 불일치', 'Position mismatch'); choose.append(reason);
    }
    choose.append(info, skills);
    choose.onclick = () => select(item);
    const deleteArea = document.createElement('div'); deleteArea.className = 'saved-evo-delete-area';
    deleteArea.onclick = event => event.stopPropagation();
    deleteArea.onkeydown = event => event.stopPropagation();
    const renderDelete = () => {
      deleteArea.replaceChildren();
      const action = (label, className, handler) => {
        const control = document.createElement('button'); control.type = 'button'; control.className = className; control.textContent = label;
        control.onclick = event => { event.stopPropagation(); handler(); };
        return control;
      };
      if (confirmDeleteId !== item.id) {
        deleteArea.append(action(text('커스텀 삭제', 'Delete Custom'), 'saved-evo-delete', () => {
          confirmDeleteId = item.id; deleteAreas.forEach(render => render());
        }));
        return;
      }
      const prompt = document.createElement('span'); prompt.className = 'saved-evo-delete-prompt'; prompt.textContent = text('삭제할까요?', 'Delete?');
      const controls = document.createElement('div'); controls.className = 'saved-evo-delete-confirm';
      controls.append(
        action(text('예', 'Yes'), 'saved-evo-delete-yes', () => {
          root.resetDeleteConfirmation();
          const result = savedEvosStore.remove(item.id);
          if (result === 'saved') onDeleted?.(item);
          else if (result === 'error') {
            const error = document.createElement('span'); error.setAttribute('role', 'alert'); error.textContent = text('저장소에 접근할 수 없습니다.', 'Unable to access storage.'); deleteArea.append(error);
          }
        }),
        action(text('아니오', 'No'), 'saved-evo-delete-no', () => root.resetDeleteConfirmation())
      );
      deleteArea.append(prompt, controls);
    };
    deleteAreas.set(item.id, renderDelete); renderDelete();
    row.append(choose, deleteArea); root.append(row);
  }
  return root;
}
