export function createMobileFiltersToggle({ button, panel, closePopovers }) {
  const mobile = window.matchMedia('(width < 768px)');
  let isOpen = true;
  let count = 0;
  let animation;

  function render() {
    const collapsed = mobile.matches && !isOpen;
    panel.classList.toggle('is-mobile-collapsed', collapsed);
    panel.inert = collapsed;
    button.setAttribute('aria-expanded', String(!collapsed));
    button.textContent = `Filters${count ? ` (${count})` : ''} ${collapsed ? '▼ (열기)' : '▲ (접기)'}`;
  }

  button.addEventListener('click', () => {
    if (!mobile.matches) return;
    animation?.cancel();
    const from = panel.getBoundingClientRect().height;
    closePopovers();
    isOpen = !isOpen;
    render();
    const to = panel.getBoundingClientRect().height;
    if (panel.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animation = panel.animate([
        { height: `${from}px`, overflow: 'clip', visibility: 'visible' },
        { height: `${to}px`, overflow: 'clip', visibility: 'visible' },
      ], { duration: 180, easing: 'ease-out' });
    }
  });
  mobile.addEventListener('change', () => {
    animation?.cancel();
    render();
  });
  render();
  return {
    updateCount(value) {
      count = value;
      render();
    },
  };
}
