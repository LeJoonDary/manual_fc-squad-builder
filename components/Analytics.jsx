import React from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';

export function mountAnalytics() {
  const container = document.createElement('div');
  container.id = 'vercel-analytics';
  document.body.appendChild(container);
  createRoot(container).render(<Analytics />);
}
