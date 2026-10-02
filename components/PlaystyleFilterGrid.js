import { groupPlaystyleOptions } from '../utils/playstyleFilters.js';

export function renderPlaystyleGrid(container, options, filters, onChange) {
  container.replaceChildren();
  const groups = groupPlaystyleOptions(options).filter(group => group.options.length);
  if (!groups.length) {
    container.textContent = 'No PlayStyles available.';
    return;
  }
  for (const group of groups) {
    const section = document.createElement('section');
    section.className = 'playstyle-filter-category';
    section.setAttribute('aria-label', group.category);
    const heading = document.createElement('h3');
    heading.textContent = group.category;
    const columns = document.createElement('div');
    columns.className = 'playstyle-filter-columns';
    for (const option of group.options) {
      const id = Number(option.id);
      const item = document.createElement('div');
      item.className = 'playstyle-filter-item';
      const label = document.createElement('p');
      label.textContent = option.name;
      label.title = option.name;
      item.append(label);
      for (const level of ['plus', 'normal']) {
        const key = level === 'plus' ? 'selectedPlusIds' : 'selectedNormalIds';
        const url = level === 'plus' ? option.image_url_plus : option.image_url;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `playstyle-filter-button${level === 'plus' ? ' is-plus' : ''}`;
        button.title = `${option.name}${level === 'plus' ? '+' : ' Normal'}`;
        button.setAttribute('aria-label', button.title);
        const sync = () => {
          const selected = filters[key].includes(id);
          button.classList.toggle('is-selected', selected);
          button.setAttribute('aria-pressed', String(selected));
        };
        sync();
        if (url) {
          const img = document.createElement('img');
          img.src = url;
          img.alt = '';
          img.width = 28;
          img.height = 28;
          img.addEventListener('error', () => {
            item.remove();
            if (!columns.children.length) section.remove();
          });
          button.append(img);
        } else {
          button.textContent = '+';
          button.disabled = true;
          button.title += ' · Icon unavailable';
        }
        button.addEventListener('click', () => {
          const index = filters[key].indexOf(id);
          if (index < 0) filters[key].push(id);
          else filters[key].splice(index, 1);
          sync();
          onChange();
        });
        item.append(button);
      }
      columns.append(item);
    }
    section.append(heading, columns);
    container.append(section);
  }
}
