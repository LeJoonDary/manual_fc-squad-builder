import { PRIORITY_GROUPS } from '../utils/priorityGroups.js';
import React, { useState } from 'react';
const RAINBOW_BADGE_STYLES = ['rose', 'orange', 'amber', 'emerald', 'sky', 'indigo', 'purple'];
export function PriorityPositionsSelector({ selectedPositions, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const positions = PRIORITY_GROUPS;
  return <section className="priority-positions">
    <button type="button" className="priority-positions-trigger" aria-expanded={open} aria-controls="priority-position-chips" onClick={() => setOpen(!open)}>
      <span className="settings-trigger-content"><span className="settings-trigger-icon" aria-hidden="true">⭐</span><span className="settings-trigger-label">Priority Positions ({selectedPositions.length ? `${selectedPositions.length} Selected` : 'Default Order'})</span></span>
      <span className="priority-positions-chevron" aria-hidden="true">{open ? '▲' : '▼'}</span>
    </button>
    <div id="priority-position-chips" hidden={!open}>
      <div className="priority-positions-header"><span>Priority Order (1–7)</span><button type="button" disabled={disabled || !selectedPositions.length} onClick={() => onChange([])}>Reset</button></div>
      <div className="priority-position-chips">{positions.map(({ id: pos, label }) => {
        const rank = selectedPositions.indexOf(pos);
        return <button type="button" key={pos} disabled={disabled} aria-pressed={rank >= 0} onClick={() => onChange(rank < 0 ? [...selectedPositions, pos] : selectedPositions.filter(p => p !== pos))}>
          {rank >= 0 && <span className={`priority-position-rank rank-${RAINBOW_BADGE_STYLES[rank]}`}>{rank + 1}</span>}{label}
        </button>;
      })}</div>
      <p>At budgets of 300,000 C or more, each card is capped by priority: 35% → 25% → 20% → 16% → 13% → 10% → 8%. Default order: ST → CAM → wings → CB → CM/CDM → fullbacks → GK. With a custom order, unselected groups use GK 10%, fullbacks 15%, others 18%.</p>
    </div>
  </section>;
}
