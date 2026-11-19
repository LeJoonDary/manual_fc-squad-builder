import { FORMATIONS } from './formations.js';
export interface SquadShareSlot { cardVersionId: string; isLocked: boolean; isOwned: boolean; }
export interface SquadSharePayload {
  version: 'v1'; formation: string; slots: (SquadShareSlot | null)[];
  manager: { leagueId: string | null; nationId: string | null } | null;
  budget: number;
}
const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
const validCode = (code: unknown) => code === null || (typeof code === 'string' && code.length > 0 && code.length <= 100 && !/[\u0000-\u001f\u007f]/.test(code));
function valid(p: any): p is SquadSharePayload {
  return p?.version === 'v1' && FORMATIONS.some(f => f.name === p.formation)
    && Array.isArray(p.slots) && p.slots.length === 11
    && p.slots.every((s: any) => s === null || (validId(s?.cardVersionId) && typeof s.isLocked === 'boolean' && typeof s.isOwned === 'boolean'))
    && (p.manager === null || (p.manager && validCode(p.manager.leagueId) && validCode(p.manager.nationId)))
    && Number.isFinite(p.budget) && Number.isInteger(p.budget) && p.budget >= 0;
}
export function encodeSquadSharePayload(payload: SquadSharePayload): string {
  if (!valid(payload)) throw new Error('Invalid squad share payload');
  const slots = payload.slots.map(s => {
    if (!s) return '';
    const mask = Number(s.isLocked) | (Number(s.isOwned) << 1);
    return s.cardVersionId + (mask ? `.${mask}` : '');
  }).join(',');
  const manager = payload.manager ? [payload.manager.leagueId, payload.manager.nationId].map(code => code === null ? '' : encodeURIComponent(code)).join(',') : '';
  return btoa(['v1', payload.formation, slots, manager, payload.budget ? String(payload.budget) : ''].join('|'))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeSquadSharePayload(value: unknown): SquadSharePayload | null {
  try {
    if (typeof value !== 'string' || !value.length || value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null;
    const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    if (btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== value) return null;
    const fields = raw.split('|');
    if (fields.length !== 5 || fields[0] !== 'v1') return null;
    const [version, formation, encodedSlots, encodedManager, encodedBudget] = fields;
    if (encodedBudget && !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e\+[0-9]+)?$/.test(encodedBudget)) return null;
    const slots = encodedSlots.split(',').map(token => {
      if (!token) return null;
      const match = /^([A-Za-z0-9_-]{1,64})(?:\.([0-3]))?$/.exec(token);
      if (!match) throw new Error('Invalid slot');
      const mask = Number(match[2] ?? 0);
      return { cardVersionId: match[1], isLocked: Boolean(mask & 1), isOwned: Boolean(mask & 2) };
    });
    let manager = null;
    if (encodedManager) {
      const codes = encodedManager.split(',');
      if (codes.length !== 2) return null;
      manager = { leagueId: codes[0] ? decodeURIComponent(codes[0]) : null, nationId: codes[1] ? decodeURIComponent(codes[1]) : null };
    }
    const payload = { version, formation, slots, manager, budget: encodedBudget ? Number(encodedBudget) : 0 };
    return valid(payload) ? payload : null;
  } catch { return null; }
}
export function buildSquadShareUrl(originAndPath: string, payload: SquadSharePayload): string {
  const url = new URL(originAndPath);
  url.search = ''; url.hash = '';
  url.searchParams.set('s', encodeSquadSharePayload(payload));
  return url.toString();
}
