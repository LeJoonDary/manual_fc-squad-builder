export const DESKTOP_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
export function hasDesktopPointer() {
  return typeof window !== 'undefined' && window.matchMedia?.(DESKTOP_POINTER_QUERY).matches === true;
}
