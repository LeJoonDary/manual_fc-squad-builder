// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createSwapConflictModal } from './SwapConflictModal.js';
HTMLDialogElement.prototype.showModal = function () { this.open = true; };
HTMLDialogElement.prototype.close = function () { this.open = false; };
afterEach(() => document.body.replaceChildren());
it('explains the conflict and rebuilds only when requested', () => {
  const rebuild = vi.fn();
  const modal = createSwapConflictModal({ rebuild });
  modal.open(['Hero']);
  expect(document.querySelector('h2').textContent).toBe('Squad Setting Conflict');
  expect(document.body.textContent).toContain("'Exclude Heroes'");
  const buttons = document.querySelectorAll('.swap-conflict-actions button');
  buttons[1].click();
  expect(rebuild).not.toHaveBeenCalled();
  modal.open(['Icon']);
  expect(document.body.textContent).toContain('an Icon card');
  buttons[0].click();
  expect(rebuild).toHaveBeenCalledTimes(1);
  expect(document.querySelector('dialog').open).toBe(false);
  modal.open(['Hero']);
  document.querySelector('.swap-modal-close').click();
  expect(document.querySelector('dialog').open).toBe(false);
  expect(rebuild).toHaveBeenCalledTimes(1);
});
