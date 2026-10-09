import { PRIORITY_GROUPS, priorityGroup } from '../utils/priorityGroups.js';
import React, { useState } from 'react';
export function PriorityPositionsSelector({ formationPositions, selectedPositions, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const available = new Set(formationPositions.map(priorityGroup));
  const positions = PRIORITY_GROUPS.filter(group => available.has(group.id));
  return <section className="priority-positions">
    <button type="button" className="priority-positions-trigger" aria-expanded={open} aria-controls="priority-position-chips" onClick={() => setOpen(!open)}>
      <span className="settings-trigger-content"><span className="settings-trigger-icon" aria-hidden="true">⭐</span><span className="settings-trigger-label">Priority Positions ({selectedPositions.length ? `${selectedPositions.length} Selected` : 'Default Order'})</span></span>
      <span className="priority-positions-chevron" aria-hidden="true">{open ? '▲' : '▼'}</span>
    </button>
    <div id="priority-position-chips" hidden={!open}>
      <div className="priority-positions-header"><span>Priority Order</span><button type="button" disabled={disabled || !selectedPositions.length} onClick={() => onChange([])}>Reset</button></div>
      <div className="priority-position-chips">{positions.map(({ id: pos, label }) => {
        const rank = selectedPositions.indexOf(pos);
        return <button type="button" key={pos} disabled={disabled} aria-pressed={rank >= 0} onClick={() => onChange(rank < 0 ? [...selectedPositions, pos] : selectedPositions.filter(p => p !== pos))}>
          {rank >= 0 && <span className="priority-position-rank">{rank + 1}</span>}{label}
        </button>;
      })}</div>
      <p>Positions are prioritized in your selected order. Unselected positions follow the recommended default order.</p>
    </div>
  </section>;
}
