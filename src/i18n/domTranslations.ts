import { getLanguage, subscribeLanguage, translateMessage } from './languageStore';
import { translations } from '../locales/translations';
import { setCardAction } from './cardActions';

// The legacy pitch is not a React tree. Translate only registered UI copy, in place:
// preserve DOM identity, event listeners, input values, selection and focus.
export function mountDomTranslations(root: HTMLElement = document.body) {
  const sources = new WeakMap<Node, { source: string; output: string }>();
  const attributes = new WeakMap<Element, Map<string, { source: string; output: string }>>();
  const protectedSelector = 'script,style,textarea,[contenteditable="true"],[data-i18n-protected],.role-name-chip,.role-badge,.playstyle-badge,.tactical-role-chip,.tactical-active-tooltip,#player-detail-stats,#player-detail-playstyles,#player-detail-roles';
  const allowed = (element: Element) => !element.closest(protectedSelector)
    && !element.closest('[data-i18n-dom],[data-i18n-react]')?.hasAttribute('data-i18n-react');
  function translateNode(node: Node) {
    if (node.nodeType !== Node.TEXT_NODE || !node.parentElement || !allowed(node.parentElement)) return;
    const current = node.nodeValue ?? '';
    const previous = sources.get(node);
    const source = previous && current === previous.output ? previous.source : current;
    const output = translateMessage(source);
    sources.set(node, { source, output });
    if (output !== current) node.nodeValue = output;
  }
  function translateElement(element: Element) {
    if (!allowed(element)) return;
    const action = (element as HTMLElement).dataset.i18nCardAction;
    if (action && Object.hasOwn(translations.en.cardActions, action)) {
      setCardAction(element as HTMLElement, action as keyof typeof translations.en.cardActions);
      return;
    }
    for (const name of ['placeholder', 'title', 'aria-label']) {
      const current = element.getAttribute(name);
      if (current === null) continue;
      let cache = attributes.get(element);
      if (!cache) { cache = new Map(); attributes.set(element, cache); }
      const previous = cache.get(name);
      const source = previous && current === previous.output ? previous.source : current;
      const output = translateMessage(source);
      cache.set(name, { source, output });
      if (output !== current) element.setAttribute(name, output);
    }
    const key = element.getAttribute('data-i18n');
    if (key) {
      const value = key.split('.').reduce<any>((value, part) => value?.[part], translations[getLanguage()]);
      if (typeof value === 'string' && element.textContent !== value) element.textContent = value;
    }
  }
  function visit(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) { translateNode(node); return; }
    if (!(node instanceof Element)) return;
    translateElement(node);
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let child: Node | null;
    while ((child = walker.nextNode())) {
      if (child instanceof Element) translateElement(child);
      else if (!child.parentElement?.hasAttribute('data-i18n')) translateNode(child);
    }
  }
  visit(root);
  const unsubscribe = subscribeLanguage(() => visit(root));
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') {
        if (!record.target.parentElement?.hasAttribute('data-i18n')) translateNode(record.target);
      } else if (record.type === 'attributes') translateElement(record.target as Element);
      else record.addedNodes.forEach(visit);
    }
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['placeholder', 'title', 'aria-label', 'data-i18n-card-action', 'data-tooltip', 'data-i18n'] });
  return () => { observer.disconnect(); unsubscribe(); };
}
