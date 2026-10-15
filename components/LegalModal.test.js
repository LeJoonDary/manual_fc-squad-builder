// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import html from '../index.html?raw';
import { createLegalModal } from './LegalModal.js';

let modal;
beforeEach(() => {
  document.body.innerHTML = html;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
  modal = createLegalModal();
});
afterEach(() => { modal.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

test('each footer link opens its corresponding complete policy in the shared dialog', () => {
  const counts = [0, 4, 3, 3];
  const buttons = [...document.querySelectorAll('[data-legal-tab]')];
  expect(buttons).toHaveLength(4);
  buttons.forEach((button, index) => {
    button.click();
    const dialog = document.querySelector('.legal-modal');
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('h2').textContent).toBe(button.textContent);
    expect(dialog.querySelectorAll('li')).toHaveLength(counts[index]);
    expect(dialog.dataset.activeTab).toBe(button.dataset.legalTab);
    expect(document.querySelectorAll('.legal-modal')).toHaveLength(1);
    modal.close();
  });
  buttons[0].click();
  expect(document.querySelector('.legal-contact-mail').href).toContain('mailto:metaxi.team@gmail.com?subject=');
});

test('Gmail popup and default mail app receive the recipient, subject and full body', () => {
  const popup = vi.spyOn(window, 'open').mockReturnValue(null);
  modal.open('contact');
  document.querySelector('.legal-contact-gmail').click();
  expect(popup).toHaveBeenCalledTimes(1);
  const [url, target, features] = popup.mock.calls[0];
  const gmail = new URL(url);
  const mail = new URL(document.querySelector('.legal-contact-mail').href);
  expect(gmail.origin).toBe('https://mail.google.com');
  expect(gmail.searchParams.get('to')).toBe('metaxi.team@gmail.com');
  expect(gmail.searchParams.get('su')).toBe('[META XI] Bug Report & Feedback');
  expect(mail.searchParams.get('subject')).toBe(gmail.searchParams.get('su'));
  expect(gmail.searchParams.get('body')).toBe('Hi META XI Team,\n\n[Please describe your issue or suggestion here]\n- Device/Browser:\n- Details:');
  expect(mail.searchParams.get('body')).toBe(gmail.searchParams.get('body'));
  expect(target).toBe('_blank');
  expect(features).toContain('width=700,height=650');
});

test('copy feedback lasts two seconds and clipboard failures are recoverable', async () => {
  vi.useFakeTimers();
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  modal.open('contact');
  const copy = document.querySelector('.legal-contact-copy');
  const status = document.querySelector('.legal-contact-status');
  copy.click();
  await Promise.resolve();
  expect(writeText).toHaveBeenCalledWith('metaxi.team@gmail.com');
  expect(status.textContent).toBe('✔ Copied!');
  vi.advanceTimersByTime(1999);
  expect(status.textContent).toBe('✔ Copied!');
  vi.advanceTimersByTime(1);
  expect(status.textContent).toBe('');
  writeText.mockRejectedValueOnce(new Error('Permission denied'));
  copy.click();
  await Promise.resolve();
  expect(status.textContent).toContain('Unable to copy');
  expect(copy.disabled).toBe(false);
});

test('close button, Escape, native cancel and backdrop restore focus and page scrolling', () => {
  const button = document.querySelector('[data-legal-tab]');
  const dialog = document.querySelector('.legal-modal');
  document.body.style.overflow = 'auto';
  for (const dismiss of [
    () => dialog.querySelector('button').click(),
    () => dialog.querySelector('button').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    () => dialog.dispatchEvent(new Event('cancel', { cancelable: true })),
    () => dialog.click(),
  ]) {
    button.focus();
    button.click();
    expect(document.body.style.overflow).toBe('hidden');
    dialog.querySelector('h2').click();
    expect(dialog.open).toBe(true);
    dismiss();
    expect(dialog.open).toBe(false);
    expect(document.body.style.overflow).toBe('auto');
    expect(document.activeElement).toBe(button);
  }
});
