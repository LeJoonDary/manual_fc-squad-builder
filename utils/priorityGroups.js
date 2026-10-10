export const PRIORITY_GROUPS = [
 { id: 'ST', label: 'ST (CF)', positions: ['ST','CF','LS','RS','LF','RF'] },
 { id: 'CAM', label: 'CAM', positions: ['CAM','LAM','RAM'] },
 { id: 'WIDE', label: 'LM/RM (LW/RW)', positions: ['LM','RM','LW','RW'] },
 { id: 'CM', label: 'CM (CDM)', positions: ['CM','CDM','LCM','RCM','LDM','RDM'] },
 { id: 'CB', label: 'CB', positions: ['CB','LCB','RCB'] },
 { id: 'FB', label: 'LB/RB (LWB/RWB)', positions: ['LB','RB','LWB','RWB'] },
 { id: 'GK', label: 'GK', positions: ['GK'] },
];
export function priorityGroup(position) {
 const input = String(position ?? '').toUpperCase();
 const value = ({ WING: 'WIDE', MID: 'CM' })[input] ?? input;
 return PRIORITY_GROUPS.find(g => g.id === value || g.positions.includes(value))?.id ?? value;
}

export const DEFAULT_PRIORITY_GROUPS = ['ST', 'CAM', 'WIDE', 'CB', 'CM', 'FB', 'GK'];
export function effectivePriorityGroups(selected = []) {
 const normalized = [...new Set(selected.map(priorityGroup))].filter(group => DEFAULT_PRIORITY_GROUPS.includes(group));
 return normalized.length ? normalized : [...DEFAULT_PRIORITY_GROUPS];
}
