import React from 'react';
import { createRoot } from 'react-dom/client';
import './MetaXILogo.css';

export interface MetaXILogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: { width: 128, height: 32, classes: 'h-8 w-32' },
  md: { width: 176, height: 44, classes: 'h-11 w-44' },
  lg: { width: 240, height: 60, classes: 'h-[60px] w-60' },
};

/** Font-independent vector lockup, designed for slate-900 surfaces. */
export function MetaXILogo({ size = 'md', className = '' }: MetaXILogoProps) {
  const dimensions = sizes[size];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 64"
      width={dimensions.width}
      height={dimensions.height}
      role="img"
      aria-label="MetaXI"
      focusable="false"
      className={`metaxi-logo ${dimensions.classes} inline-block shrink-0 overflow-visible transition-transform duration-200 hover:scale-105 hover:brightness-110 motion-reduce:transition-none ${className}`}
    >
      <title>MetaXI</title>
      {/* Diamond perimeter and angular Starting XI monogram. */}
      <g className="metaxi-logo-accent text-emerald-400">
        <path d="M32 3 61 32 32 61 3 32Z" fill="#0f172a" stroke="currentColor" strokeWidth="1.5" />
        <path d="M32 9 55 32 32 55 9 32Z" fill="currentColor" opacity=".07" />
        <path d="M15 20h8l7 9 7-9h8L34 34l7 10h-8l-7-9-7 9h-8l11-14Z" fill="currentColor" />
        <path d="m45 20 6 6-9 18h-7Z" fill="#f1f5f9" />
        <path d="m26 3 6-3 6 3-6 3Z" fill="currentColor" />
      </g>
      {/* META: custom geometric letterforms, no external font dependency. */}
      <g className="metaxi-logo-word text-slate-100" fill="currentColor">
        <path d="M78 45V19h6l8 12 8-12h6v26h-6V29l-8 11-8-11v16Z" />
        <path d="M112 19h22v6h-16v4h14v6h-14v4h16v6h-22Z" />
        <path d="M139 19h26v6h-10v20h-6V25h-10Z" />
        <path fillRule="evenodd" d="m168 45 11-26h7l11 26h-7l-2-6h-11l-2 6Zm11-12h7l-3.5-9Z" />
      </g>
      <g className="metaxi-logo-accent text-emerald-400" fill="currentColor">
        <path d="M204 19h8l7 9 7-9h8l-11 13 11 13h-8l-7-9-7 9h-8l11-13Z" />
        <path d="M240 19h7v26h-7Z" />
      </g>
    </svg>
  );
}

export default MetaXILogo;

/** Bridge for the existing non-React application header. */
export function mountMetaXILogo(container: HTMLElement) {
  const root = createRoot(container);
  root.render(<MetaXILogo />);
  return () => root.unmount();
}
