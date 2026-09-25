import { isPositionMatched } from './chemistry.ts';

// Rows are ordered from attack to defence, followed by the goalkeeper.
const layouts = {
  '3-1-4-2': [['LS', 'RS'], ['LM', 'LCM', 'RCM', 'RM'], ['CDM'], ['LCB', 'CB', 'RCB']],
  '3-4-1-2': [['LS', 'RS'], ['CAM'], ['LM', 'LCM', 'RCM', 'RM'], ['LCB', 'CB', 'RCB']],
  '3-4-2-1': [['ST'], ['LAM', 'RAM'], ['LM', 'LCM', 'RCM', 'RM'], ['LCB', 'CB', 'RCB']],
  '3-4-3': [['LW', 'ST', 'RW'], ['LM', 'LCM', 'RCM', 'RM'], ['LCB', 'CB', 'RCB']],
  '3-5-2': [['LS', 'RS'], ['LM', 'CAM', 'RM'], ['LDM', 'RDM'], ['LCB', 'CB', 'RCB']],
  '4-1-2-1-2': [['LS', 'RS'], ['LM', 'CAM', 'RM'], ['CDM'], ['LB', 'LCB', 'RCB', 'RB']],
  '4-1-2-1-2 (2)': [['LS', 'RS'], ['CAM'], ['LCM', 'CDM', 'RCM'], ['LB', 'LCB', 'RCB', 'RB']],
  '4-1-3-2': [['LS', 'RS'], ['LM', 'CM', 'RM'], ['CDM'], ['LB', 'LCB', 'RCB', 'RB']],
  '4-1-4-1': [['ST'], ['LM', 'LCM', 'RCM', 'RM'], ['CDM'], ['LB', 'LCB', 'RCB', 'RB']],
  '4-2-1-3': [['LW', 'ST', 'RW'], ['CAM'], ['LDM', 'RDM'], ['LB', 'LCB', 'RCB', 'RB']],
  '4-2-2-2': [['LS', 'RS'], ['LAM', 'RAM'], ['LDM', 'RDM'], ['LB', 'LCB', 'RCB', 'RB']],
  '4-2-3-1': [['ST'], ['LAM', 'CAM', 'RAM'], ['LDM', 'RDM'], ['LB', 'LCB', 'RCB', 'RB']],
  '4-2-3-1 (2)': [['ST'], ['LM', 'CAM', 'RM'], ['LDM', 'RDM'], ['LB', 'LCB', 'RCB', 'RB']],
  '4-3-1-2': [['LS', 'RS'], ['CAM'], ['LCM', 'CM', 'RCM'], ['LB', 'LCB', 'RCB', 'RB']],
  '4-3-2-1': [['ST'], ['LAM', 'RAM'], ['LCM', 'CM', 'RCM'], ['LB', 'LCB', 'RCB', 'RB']],
  '4-3-3': [['LW', 'ST', 'RW'], ['LCM', 'CM', 'RCM'], ['LB', 'LCB', 'RCB', 'RB']],
  '4-3-3 (2)': [['LW', 'ST', 'RW'], ['LCM', 'RCM'], ['CDM'], ['LB', 'LCB', 'RCB', 'RB']],
  '4-3-3 (3)': [['LW', 'ST', 'RW'], ['CM'], ['LDM', 'RDM'], ['LB', 'LCB', 'RCB', 'RB']],
  '4-3-3 (4)': [['LW', 'ST', 'RW'], ['CAM'], ['LCM', 'RCM'], ['LB', 'LCB', 'RCB', 'RB']],
  '4-4-1-1': [['ST'], ['CAM'], ['LM', 'LCM', 'RCM', 'RM'], ['LB', 'LCB', 'RCB', 'RB']],
  '4-4-2': [['LS', 'RS'], ['LM', 'LCM', 'RCM', 'RM'], ['LB', 'LCB', 'RCB', 'RB']],
  '4-4-2 (2)': [['LS', 'RS'], ['LM', 'LDM', 'RDM', 'RM'], ['LB', 'LCB', 'RCB', 'RB']],
  '4-5-1': [['ST'], ['LAM', 'RAM'], ['LM', 'CM', 'RM'], ['LB', 'LCB', 'RCB', 'RB']],
  '4-5-1 (2)': [['ST'], ['LM', 'LCM', 'CM', 'RCM', 'RM'], ['LB', 'LCB', 'RCB', 'RB']],
  '5-2-1-2': [['LS', 'RS'], ['CAM'], ['LCM', 'RCM'], ['LB', 'LCB', 'CB', 'RCB', 'RB']],
  '5-2-3': [['LW', 'ST', 'RW'], ['LCM', 'RCM'], ['LB', 'LCB', 'CB', 'RCB', 'RB']],
  '5-3-2': [['LS', 'RS'], ['LCM', 'CM', 'RCM'], ['LB', 'LCB', 'CB', 'RCB', 'RB']],
  '5-4-1': [['ST'], ['LM', 'LCM', 'RCM', 'RM'], ['LB', 'LCB', 'CB', 'RCB', 'RB']],
};

export const FORMATIONS = Object.entries(layouts).map(([name, outfield]) => {
  const rows = [...outfield, ['GK']];
  // Leave room for the enlarged card, its separate price capsule, and a row gap.
  return { name, height: rows.length > 4 ? 1280 : 1040, slots: rows.flatMap((row, index) =>
    row.map((position, column) => ({ position,
      x: row.length === 1 ? 50 : 12 + column * 76 / (row.length - 1),
      y: 5 + index * 72 / (rows.length - 1),
    }))) };
});

// Maximise valid positions globally, then preserve original slot positions.
// Every existing card and its lock/ownership state is retained exactly once.
export function reassignFormation(squad, slots) {
  const entries = Object.entries(squad).filter(([, entry]) => entry?.card);
  const memo = new Map();
  function assign(index, mask) {
    if (index === entries.length) return { score: 0, choices: [] };
    const key = `${index}:${mask}`;
    if (memo.has(key)) return memo.get(key);
    const [oldPosition, entry] = entries[index];
    let best = { score: -Infinity, choices: [] };
    slots.forEach((slot, i) => {
      if (mask & (1 << i)) return;
      const rest = assign(index + 1, mask | (1 << i));
      const score = rest.score + (isPositionMatched(slot.position, entry.chemistryCard) ? 100 : 0)
        + (oldPosition === slot.position ? 1 : 0);
      if (score > best.score) best = { score, choices: [i, ...rest.choices] };
    });
    memo.set(key, best);
    return best;
  }
  const { choices } = assign(0, 0);
  return Object.fromEntries(entries.map(([, entry], i) => [slots[choices[i]].position, entry]));
}
