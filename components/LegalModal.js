const supportEmail = 'metaxi.team@gmail.com';
const supportSubject = '[META XI] Bug Report & Feedback';
const supportBody = 'Hi META XI Team,\n\n[Please describe your issue or suggestion here]\n- Device/Browser:\n- Details:';
const mailtoUrl = `mailto:${supportEmail}?subject=${encodeURIComponent(supportSubject)}&body=${encodeURIComponent(supportBody)}`;
const gmailUrl = `https://mail.google.com/mail/?${new URLSearchParams({ view: 'cm', fs: '1', to: supportEmail, su: supportSubject, body: supportBody })}`;

const legalTabs = {
  contact: {
    title: 'Contact & Feedback',
    sections: [
      ['General Inquiries & Suggestions', 'We welcome your bug reports, feature requests, and feedback to help improve the squad builder algorithm.'],
      ['Database Issues', 'If you notice incorrect player stats, missing traits, or outdated chemistry links, please let us know.'],
      ['Contact', 'Email: metaxi.team@gmail.com'],
    ],
  },
  terms: {
    title: 'Terms of Service',
    sections: [
      ['Purpose of Service', 'META XI is an independent, non-commercial squad building and chemistry optimization tool created for the EA SPORTS FC gaming community.'],
      ['Accuracy of Information', 'Player data, prices, and chemistry calculations are provided for informational and squad-planning purposes only. While we strive to maintain accurate data, in-game values and real-time transfer market prices may vary.'],
      ['Limitation of Liability', 'META XI is not responsible for any in-game coin losses, market fluctuations, or transfer market decisions resulting from the use of this service.'],
      ['Service Availability', 'We reserve the right to update, modify, or temporarily suspend features without prior notice for ongoing maintenance and engine improvements.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    sections: [
      ['No Personal Data Collected', 'META XI does not require user registration or login. We do not collect, process, or sell any personal identifiable information (PII).'],
      ['Local Storage', 'Custom squads (Slot 1, Slot 2, Slot 3) and priority settings are stored locally on your device via browser LocalStorage. This data is never transferred to external servers and can be erased by clearing your browser cache.'],
      ['Third-Party CDNs & Assets', 'This website may request fonts or cached card graphics through trusted content delivery networks solely to render visual game items. No tracking cookies are used to identify individual users.'],
    ],
  },
  disclaimer: {
    title: 'Disclaimer',
    sections: [
      ['Non-Affiliation', 'META XI is an unofficial, fan-made squad builder and is not affiliated with, endorsed, sponsored, or specifically approved by Electronic Arts Inc. (EA), FIFA, FIFPRO, or any professional football clubs and leagues.'],
      ['Copyright & Trademarks', 'All EA SPORTS FC assets, player names, face images, club crests, league logos, and card templates are intellectual properties of Electronic Arts Inc. and their respective rights holders.'],
      ['Fair Use', 'All copyrighted materials displayed on this site are utilized strictly under Fair Use doctrine for non-commercial commentary, squad strategy, and educational purposes.'],
    ],
  },
};

export function createLegalModal() {
  const dialog = document.createElement('dialog');
  dialog.className = 'legal-modal';
  dialog.setAttribute('aria-labelledby', 'legal-modal-title');
  dialog.innerHTML = `<div class="legal-modal-box">
    <header class="legal-modal-header"><h2 id="legal-modal-title"></h2>
      <button type="button" class="legal-modal-close" aria-label="Close legal dialog">✕</button>
    </header>
    <div class="legal-modal-body custom-scrollbar" tabindex="0" role="region" aria-labelledby="legal-modal-title"></div>
  </div>`;
  document.body.append(dialog);
  const title = dialog.querySelector('h2');
  const body = dialog.querySelector('.legal-modal-body');
  const closeButton = dialog.querySelector('button');
  let returnFocus;
  let previousOverflow;
  let copyTimer;
  let contactVersion = 0;

  function resetContact() {
    clearTimeout(copyTimer);
    contactVersion += 1;
  }

  function renderContactActions() {
    const panel = document.createElement('div');
    panel.className = 'legal-contact';
    panel.innerHTML = `<div><h3>Send Us Your Feedback</h3>
      <p>Found a bug or have an idea to improve the squad builder? Send your thoughts directly to our development team.</p></div>
      <div class="legal-contact-card">
        <div class="legal-contact-address"><span>Official Support</span><strong>${supportEmail}</strong></div>
        <div class="legal-contact-actions">
          <a class="legal-contact-gmail" target="_blank" rel="noopener noreferrer">Send via Gmail (Web)</a>
          <a class="legal-contact-mail">Default Mail App</a>
        </div>
        <button type="button" class="legal-contact-copy">Copy Address</button>
        <p class="legal-contact-status" role="status" aria-live="polite"></p>
      </div>`;
    const gmail = panel.querySelector('.legal-contact-gmail');
    gmail.href = gmailUrl;
    gmail.addEventListener('click', event => {
      event.preventDefault();
      window.open(gmailUrl, '_blank', 'width=700,height=650,noopener,noreferrer');
    });
    panel.querySelector('.legal-contact-mail').href = mailtoUrl;
    const copy = panel.querySelector('.legal-contact-copy');
    const status = panel.querySelector('.legal-contact-status');
    const version = contactVersion;
    copy.addEventListener('click', async () => {
      clearTimeout(copyTimer);
      copy.disabled = true;
      status.textContent = '';
      try {
        await navigator.clipboard.writeText(supportEmail);
        if (version !== contactVersion) return;
        status.textContent = '✔ Copied!';
        copyTimer = setTimeout(() => { status.textContent = ''; }, 2000);
      } catch {
        if (version !== contactVersion) return;
        status.textContent = 'Unable to copy. Please select and copy the address above.';
      } finally {
        copy.disabled = false;
      }
    });
    return panel;
  }

  function close() {
    resetContact();
    if (dialog.open) dialog.close();
  }

  function open(tab) {
    const content = legalTabs[tab];
    if (!content) return;
    resetContact();
    title.textContent = content.title;
    dialog.dataset.activeTab = tab;
    const list = document.createElement(tab === 'contact' ? 'ul' : 'ol');
    for (const [heading, text] of content.sections) {
      const section = document.createElement('li');
      const label = document.createElement('h3');
      label.textContent = `${heading}:`;
      const paragraph = document.createElement('p');
      if (tab === 'contact' && heading === 'Contact') {
        const email = document.createElement('a');
        email.href = mailtoUrl;
        email.textContent = 'metaxi.team@gmail.com';
        paragraph.append('Email: ', email);
      } else {
        paragraph.textContent = text;
      }
      section.append(label, paragraph);
      list.append(section);
    }
    body.replaceChildren(list);
    if (tab === 'contact') body.replaceChildren(renderContactActions());
    if (!dialog.open) {
      returnFocus = document.activeElement;
      previousOverflow = document.body.style.overflow;
      dialog.showModal();
      document.body.style.overflow = 'hidden';
    }
    body.scrollTop = 0;
    closeButton.focus();
  }

  closeButton.addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });
  dialog.addEventListener('close', () => {
    resetContact();
    document.body.style.overflow = previousOverflow;
    if (returnFocus?.isConnected) returnFocus.focus();
  });
  const buttons = [...document.querySelectorAll('[data-legal-tab]')];
  const onClick = event => open(event.currentTarget.dataset.legalTab);
  buttons.forEach(button => button.addEventListener('click', onClick));
  return {
    open, close,
    destroy() {
      close();
      buttons.forEach(button => button.removeEventListener('click', onClick));
      dialog.remove();
    },
  };
}
