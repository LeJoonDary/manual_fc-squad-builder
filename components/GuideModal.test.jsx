// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { GuideControl } from './GuideModal.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.open = true; });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
const render = () => act(async () => root.render(<GuideControl />));
const click = element => act(async () => element.click());
const modal = () => document.querySelector('.guide-modal');

it('opens on first visit with the video and removes playback on close', async () => {
  await render();
  expect(modal().open).toBe(true);
  expect(modal().querySelector('iframe').src).toBe('https://www.youtube.com/embed/4SWZx9PyVEQ');
  await click(document.querySelector('.guide-close-button'));
  expect(modal()).toBeNull();
  expect(document.querySelector('iframe')).toBeNull();
  expect(localStorage.getItem('hideMetaXiGuide')).toBeNull();
  expect(document.body.style.overflow).toBe('');
});
it('saves opt-out only on close and always allows manual reopening', async () => {
  await render();
  await click(modal().querySelector('input'));
  expect(localStorage.getItem('hideMetaXiGuide')).toBeNull();
  await click(document.querySelector('.guide-close-button'));
  expect(localStorage.getItem('hideMetaXiGuide')).toBe('true');
  await act(async () => root.render(null));
  await render();
  expect(modal()).toBeNull();
  host.querySelector('button').focus();
  await click(host.querySelector('button'));
  expect(modal().open).toBe(true);
  await click(modal().querySelector('[aria-label="Close guide"]'));
  expect(document.activeElement).toBe(host.querySelector('button'));
});
it('supports Escape and opting back in', async () => {
  localStorage.setItem('hideMetaXiGuide', 'true');
  await render();
  await click(host.querySelector('button'));
  await click(modal().querySelector('input'));
  await act(async () => modal().dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true })));
  expect(modal()).toBeNull();
  expect(localStorage.getItem('hideMetaXiGuide')).toBeNull();
});
it('remains usable when browser storage is unavailable', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  await render();
  await click(modal().querySelector('input'));
  await click(document.querySelector('.guide-close-button'));
  expect(modal()).toBeNull();
});
