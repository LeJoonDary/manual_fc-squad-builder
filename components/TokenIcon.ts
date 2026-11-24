// DOM component, matching the existing PlayerCard renderer. No shared SVG IDs.
export function TokenIcon({ className = 'token-icon' }: { className?: string } = {}): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', xmlns: ns, class: className, 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  const layers = [
    ['polygon', { points: '12,1.8 20.8,6.9 20.8,17.1 12,22.2 3.2,17.1 3.2,6.9', fill: '#0F766E', stroke: '#5EEAD4', 'stroke-width': '1.8', 'stroke-linejoin': 'round' }],
    ['polygon', { points: '12,4.8 18.2,8.4 18.2,15.6 12,19.2 5.8,15.6 5.8,8.4', fill: '#14B8A6', stroke: '#99F6E4', 'stroke-width': '1', 'stroke-opacity': '0.65', 'stroke-linejoin': 'round' }],
    ['path', { d: 'M12 7.2L13.35 10.65L16.8 12L13.35 13.35L12 16.8L10.65 13.35L7.2 12L10.65 10.65L12 7.2Z', fill: '#F0FDFA' }],
  ] as const;
  for (const [tag, attrs] of layers) {
    const layer = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) layer.setAttribute(key, value);
    svg.append(layer);
  }
  return svg;
}
