// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test } from 'vitest';
import { PriorityPositionsSelector } from './PriorityPositionsSelector.jsx';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
test('unlimited chip selection renumbers after removal and resets', async () => {
 const host=document.createElement('div'); const root=createRoot(host);
 function Harness(){const [selected,onChange]=useState([]);return <PriorityPositionsSelector selectedPositions={selected} onChange={onChange}/>;}
 await act(async()=>root.render(<Harness/>));
 try {
  await act(async()=>host.querySelector('.priority-positions-trigger').click());
  const chips=[...host.querySelectorAll('.priority-position-chips button')];
  expect(chips).toHaveLength(7);
  for(const chip of chips) await act(async()=>chip.click());
  expect(host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(7);
  expect([...host.querySelectorAll('.priority-position-rank')].map(n=>n.textContent)).toEqual(['1','2','3','4','5','6','7']);
  expect([...host.querySelectorAll('.priority-position-rank')].map(n => n.className.split(' ').at(-1))).toEqual(['rank-rose','rank-orange','rank-amber','rank-emerald','rank-sky','rank-indigo','rank-purple']);
  await act(async()=>chips[1].click());
  expect(chips[2].querySelector('.priority-position-rank').className).toContain('rank-orange');
  expect([...host.querySelectorAll('.priority-position-rank')].map(n=>n.textContent)).toEqual(['1','2','3','4','5','6']);
  await act(async()=>host.querySelector('.priority-positions-header button').click());
  expect(host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
  expect(host.textContent).toContain('Default Order');
 } finally { await act(async()=>root.unmount()); }
});
