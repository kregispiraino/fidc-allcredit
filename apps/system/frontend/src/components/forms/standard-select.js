const normalizeSearch = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
// Field identity is shared by forms, inline controls and action cards.
const registrationSelect = select => select.hasAttribute('data-registration-select') || [...select.attributes].some(attribute =>
  (attribute.name === 'name' || /^data-.*(field|key)$/.test(attribute.name)) && /Ids?$/.test(attribute.value));
const filterSelect = select => select.hasAttribute('data-filter-value') || select.hasAttribute('data-select-filter');

// Native controls retain form values/validation; all visible interaction uses
// the dashboard filter's trigger, card and option styles.
export function initializeStandardSelects(root = document.body) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const controls = new WeakMap();
  let opened = null;
  let sequence = 0;

  function close(restoreFocus = false) {
    if (!opened) return;
    const { trigger, menu } = opened;
    opened = null;
    trigger.setAttribute('aria-expanded', 'false');
    menu.remove();
    if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
  }

  function sync(select) {
    const trigger = controls.get(select);
    if (!trigger) return;
    if (select.dataset.selectAppearance === 'segmented') {
      trigger.querySelectorAll('[data-choice-value]').forEach(button => {
        const option = [...select.options].find(item => item.value === button.dataset.choiceValue);
        button.setAttribute('aria-pressed', String(Boolean(option?.selected)));
        button.disabled = select.disabled || !option || option.disabled;
        button.hidden = !option || option.hidden;
      });
      return;
    }
    const label = registrationSelect(select) && !filterSelect(select) && !select.value ? select.dataset.placeholder || 'Selecione'
      : [...select.selectedOptions].map(option => option.textContent).join(', ') || select.dataset.placeholder || 'Selecione';
    trigger.querySelector('span').textContent = select.dataset.selectAppearance === 'avatar'
      ? select.value ? label.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('pt-BR') : '+'
      : label;
    trigger.dataset.tooltip = label;
    if(select.dataset.selectAppearance==='compact')trigger.setAttribute('aria-description',label);
    const compactText=trigger.querySelector('.standard-select-compact-symbol');
    if(compactText)compactText.textContent=select.selectedOptions[0]?.dataset.compactLabel||label;
    if (select.closest('.standard-data-table td') && !['avatar','compact'].includes(select.dataset.selectAppearance) && !select.closest('.dependent-choice')) {
      trigger.parentElement.style.setProperty('--table-input-width', `max(160px, calc(${Math.max(8, [...label].length)}em + 40px))`);
    }
    trigger.disabled = select.disabled;
  }

  function positionMenu(trigger, menu) {
    const rect = trigger.getBoundingClientRect();
    const viewport = win.visualViewport;
    const top = viewport?.offsetTop || 0, left = viewport?.offsetLeft || 0;
    const viewportWidth = viewport?.width || win.innerWidth, viewportHeight = viewport?.height || win.innerHeight;
    const width = Math.min(Math.max(rect.width, 220), viewportWidth - 16);
    menu.style.width = `${width}px`;
    const height = Math.min(260, menu.scrollHeight || 260);
    const below = Math.max(0, top + viewportHeight - rect.bottom - 12), above = Math.max(0, rect.top - top - 12);
    const useBelow = below >= height || below >= above;
    const available = Math.min(useBelow ? below : above, viewportHeight - 16);
    const menuTop = useBelow ? rect.bottom + 5 : rect.top - Math.min(height, available) - 5;
    menu.style.maxHeight = `${Math.min(260, available)}px`;
    menu.style.left = `${Math.max(left + 8, Math.min(rect.left, left + viewportWidth - width - 8))}px`;
    menu.style.top = `${Math.max(top + 8, Math.min(menuTop, top + viewportHeight - Math.min(height, available) - 8))}px`;
    return rect;
  }

  function open(select, trigger) {
    if (opened?.trigger === trigger) return close();
    close();
    sync(select);
    const menu = doc.createElement('div');
    menu.className = 'filter-menu open standard-select-menu';
    menu.id = trigger.getAttribute('aria-controls');
    const list = doc.createElement('div');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', trigger.getAttribute('aria-label'));
    if (select.multiple) list.setAttribute('aria-multiselectable', 'true');
    const options = [...select.options].filter(option => !option.hidden && (!registrationSelect(select) || filterSelect(select) || option.value !== ''));
    const searchable = select.dataset.selectSearch !== 'false' && (registrationSelect(select) || select.hasAttribute('data-select-search') || options.length > 8);
    let search;
    if (searchable) {
      const searchRow = doc.createElement('div');
      searchRow.className = 'standard-select-search';
      search = doc.createElement('input');
      search.type = 'search';
      search.placeholder = 'Buscar…';
      search.autocomplete = 'off';
      search.setAttribute('aria-label', `Buscar em ${trigger.getAttribute('aria-label')}`);
      searchRow.append(search);
      menu.append(searchRow);
    }
    menu.append(list);
    options.forEach(option => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = `filter-option${option.selected ? ' active' : ''}`;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(option.selected));
      button.dataset.selectValue = option.value;
      button.disabled = option.disabled || option.parentElement.disabled === true;
      const renderOption = (target = button, current = option) => {
        target.replaceChildren();
        if (!current.dataset.optionDescription) {
          target.textContent = `${select.multiple && current.selected ? '✓ ' : ''}${current.textContent}`;
          return;
        }
        if (select.multiple && current.selected) {
          const mark = doc.createElement('span');
          mark.className = 'standard-select-option-mark';
          mark.textContent = '✓';
          target.append(mark);
        }
        const copy = doc.createElement('span');
        copy.className = 'standard-select-option-copy';
        const title = doc.createElement('strong');
        title.textContent = current.textContent;
        copy.append(title);
        if (current.dataset.optionDescription) {
          const description = doc.createElement('small');
          description.textContent = `(${current.dataset.optionDescription})`;
          copy.append(description);
        }
        target.append(copy);
      };
      renderOption();
      button.addEventListener('click', event => {
        event.stopPropagation();
        if (select.multiple) option.selected = !option.selected;
        else select.value = option.value;
        select.dispatchEvent(new win.Event('change', { bubbles: true }));
        sync(select);
        if (!select.multiple) return close(true);
        options.forEach((item, index) => {
          const child = list.children[index];
          child.classList.toggle('active', item.selected);
          child.setAttribute('aria-selected', String(item.selected));
          renderOption(child, item);
          child.disabled = item.disabled;
        });
      });
      list.append(button);
    });
    const empty = doc.createElement('div');
    empty.className = 'standard-select-empty';
    empty.setAttribute('role', 'status');
    empty.textContent = 'Nenhuma opção disponível';
    empty.hidden = options.length > 0;
    menu.append(empty);
    search?.addEventListener('input', () => {
      const query = normalizeSearch(search.value);
      [...list.children].forEach((button, index) => { button.hidden = !normalizeSearch(options[index].textContent).includes(query); });
      empty.textContent = options.length ? 'Nenhum resultado encontrado' : 'Nenhuma opção disponível';
      empty.hidden = [...list.children].some(button => !button.hidden);
      menu.scrollTop = 0;
    });
    // Keep the dropdown within a modal's active subtree, and lift it above
    // scrolling/overflow containers without changing Askora's interaction.
    (select.closest('dialog') || doc.body).append(menu);
    if (typeof menu.showPopover === 'function') {
      menu.setAttribute('popover', 'manual');
      menu.showPopover();
    }
    const rect = positionMenu(trigger, menu);
    opened = { select, trigger, menu, rect, search };
    trigger.setAttribute('aria-expanded', 'true');
    // Focusing a fixed menu must not scroll the page/card behind it: that
    // synthetic scroll would immediately dismiss the menu on small screens.
    const selectedOption = menu.querySelector('[aria-selected="true"]:not(:disabled)') || menu.querySelector('button:not(:disabled)');
    (search || selectedOption)?.focus({ preventScroll: true });
    if (selectedOption && !search) menu.scrollTop = Math.max(0, selectedOption.offsetTop - menu.clientHeight / 2);
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
      if (event.key === 'Tab') { close(true); }
      const buttons = [...list.querySelectorAll('button:not(:disabled):not([hidden])')];
      if (event.target === search && event.key === 'Enter') { event.preventDefault(); buttons[0]?.click(); return; }
      if (event.target === search && ['Home', 'End'].includes(event.key)) return;
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && buttons.length) {
        event.preventDefault();
        const index = buttons.indexOf(doc.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index < 0 ? (event.key === 'ArrowDown' ? 0 : buttons.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus();
      }
    });
  }

  function enhance(select) {
    if (controls.has(select)) return;
    if (select.dataset.selectAppearance === 'segmented') {
      const group = doc.createElement('div');
      group.className = 'standard-select-segmented';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', select.getAttribute('aria-label') || 'Escolha o tipo');
      for (const option of select.options) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'standard-choice-option';
        button.dataset.choiceValue = option.value;
        button.textContent = option.textContent;
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          close();
          select.value = option.value;
          select.dispatchEvent(new win.Event('change', { bubbles: true }));
        });
        group.append(button);
      }
      select.before(group);
      group.prepend(select);
      select.classList.add('standard-select-native');
      select.tabIndex = -1;
      select.setAttribute('aria-hidden', 'true');
      controls.set(select, group);
      select.addEventListener('change', () => sync(select));
      select.addEventListener('invalid', event => {
        event.preventDefault();
        group.querySelector('button:not(:disabled)')?.focus();
      });
      sync(select);
      return;
    }
    const wrapper = doc.createElement('div');
    wrapper.className = 'standard-select';
    const trigger = doc.createElement('button');
    trigger.type = 'button';
    trigger.className = `filter-select standard-select-trigger${select.classList.contains('inline-cell-control') ? ' inline-select-trigger' : ''}`;
    if (select.dataset.selectAppearance === 'avatar') trigger.classList.add('standard-select-avatar');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', `standard-select-${++sequence}`);
    trigger.setAttribute('aria-label', select.getAttribute('aria-label') || select.closest('label')?.querySelector('span')?.textContent || select.dataset.inlineField || 'Selecionar');
    trigger.innerHTML = '<span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
    if(select.dataset.selectAppearance==='compact'){
      wrapper.classList.add('standard-select-compact');
      const path=select.dataset.selectIcon==='recurrence'?'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1':'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2';
      trigger.innerHTML=`<span class="standard-select-compact-label"></span><svg class="standard-select-compact-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
      if(select.hasAttribute('data-select-compact-text'))trigger.innerHTML='<span class="standard-select-compact-label"></span><span class="standard-select-compact-symbol" aria-hidden="true"></span>';
    }
    select.before(wrapper);
    wrapper.append(select, trigger);
    select.classList.add('standard-select-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    controls.set(select, trigger);
    sync(select);
    trigger.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); open(select, trigger); });
    trigger.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); open(select, trigger); }
    });
    select.addEventListener('change', () => {
      trigger.removeAttribute('aria-invalid');
      sync(select);
    });
    select.addEventListener('invalid', event => {
      event.preventDefault();
      trigger.setAttribute('aria-invalid', 'true');
      trigger.focus();
    });
  }

  function scan(node) {
    if (node.nodeType !== 1) return;
    if (node.matches('select')) enhance(node);
    node.querySelectorAll('select').forEach(enhance);
  }
  scan(root);
  const observer = new win.MutationObserver(records => {
    if (opened && !opened.trigger.isConnected) close();
    for (const record of records) {
      for (const node of record.addedNodes) if (root.contains(node)) scan(node);
      const select = record.target.closest?.('select');
      if (select && controls.has(select)) sync(select);
    }
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected'] });
  doc.addEventListener('click', event => {
    if (opened && !opened.menu.contains(event.target) && !opened.trigger.contains(event.target)) close();
  });
  const reposition = () => { if (opened) opened.rect = positionMenu(opened.trigger, opened.menu); };
  // A virtual keyboard changes the viewport. Keep the searchable card open
  // and reposition it instead of discarding the query/focus.
  win.addEventListener('resize', reposition);
  win.visualViewport?.addEventListener('resize', reposition);
  win.visualViewport?.addEventListener('scroll', reposition);
  doc.addEventListener('scroll', event => {
    if (!opened || opened.menu.contains(event.target)) return;
    const rect = opened.trigger.getBoundingClientRect();
    // A scroll queued before the click may arrive after opening the menu.
    // Dismiss only if its anchor actually moved since we positioned it.
    if (Math.abs(rect.top - opened.rect.top) > 1 || Math.abs(rect.left - opened.rect.left) > 1) {
      if (opened.search === doc.activeElement) reposition();
      else close();
    }
  }, true);
  return { close, refresh: () => scan(root) };
}
