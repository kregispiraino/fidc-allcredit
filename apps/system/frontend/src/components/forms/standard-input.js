import { inputFormat, parseLocalizedNumber, localizedNumber } from './input-semantics.js';
import { enhanceDateInput } from './standard-date-input.js';

// Enhancement preserves the native controls, selectors, FormData and validators.
// One observer and one floating editor for the entire application.
export function initializeStandardInputs(root = document.body, { generate, notify = () => {} } = {}) {
  const doc = root.ownerDocument, win = doc.defaultView;
  const enhanced = new WeakMap();
  let editor = null, sequence = 0;
  const emit = (source, type) => source.dispatchEvent(new win.Event(type, { bubbles: true }));
  const identity = source => [...source.attributes].find(a => a.name === 'name' || /^data-.*(field|key)$/.test(a.name))?.value;
  const label = source => source.getAttribute('aria-label') || source.closest('label')?.querySelector('span')?.textContent || source.placeholder
    || source.closest('table')?.querySelectorAll('thead th')[source.closest('td')?.cellIndex]?.textContent || 'Campo';

  function positionEditor() {
    if (!editor) return;
    if (!editor.source.isConnected || editor.source.disabled) return closeEditor(false);
    const { panel, source } = editor, rect = source.getBoundingClientRect();
    const viewport = win.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const width = viewport?.width || win.innerWidth, height = viewport?.height || win.innerHeight;
    panel.style.width = `${Math.min(420, width - 24)}px`;
    panel.style.maxHeight = `${height - 24}px`;
    const h = panel.offsetHeight;
    panel.style.left = `${Math.max(left + 12, Math.min(rect.left, left + width - panel.offsetWidth - 12))}px`;
    panel.style.top = `${Math.max(top + 12, Math.min(rect.bottom + 6, top + height - h - 12))}px`;
  }
  function closeEditor(restoreFocus = true, cancel = false) {
    if (!editor) return;
    const { panel, source, previous } = editor;
    editor = null;
    if (cancel) { source.value = previous; emit(source, 'input'); }
    panel.remove(); source.setAttribute('aria-expanded', 'false');
    emit(source, 'change');
    if (restoreFocus && source.isConnected) source.focus({ preventScroll: true });
  }
  function openEditor(source) {
    if (source.disabled || source.readOnly || editor?.source === source) return;
    closeEditor(false);
    const panel = doc.createElement('div');
    panel.className = 'standard-text-editor'; panel.id = source.getAttribute('aria-controls');
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', `Editar ${label(source)}`);
    const header = doc.createElement('header'), title = doc.createElement('strong'), done = doc.createElement('button');
    title.textContent = label(source); done.type = 'button'; done.className = 'row-icon-action';
    done.textContent = '×'; done.setAttribute('aria-label', 'Fechar editor');
    header.append(title, done);
    const text = doc.createElement('textarea'); text.value = source.value;
    text.setAttribute('aria-label', label(source)); text.placeholder = source.placeholder;
    if (source.maxLength >= 0) text.maxLength = source.maxLength;
    const footer = doc.createElement('footer'), count = doc.createElement('small');
    const cancel = doc.createElement('button'), apply = doc.createElement('button');
    cancel.type = apply.type = 'button'; cancel.className = apply.className = 'form-action secondary';
    cancel.textContent = 'Cancelar'; apply.textContent = 'Concluir';
    footer.append(count, cancel, apply); panel.append(header, text, footer);
    editor = { panel, source, previous: source.value };
    const updateCount = () => { count.textContent = `${text.value.length}${text.maxLength >= 0 ? ` / ${text.maxLength}` : ''}`; };
    text.addEventListener('input', () => {
      source.value = text.value; emit(source, 'input'); updateCount();
    });
    text.addEventListener('change', () => emit(source, 'change'));
    cancel.onclick = () => closeEditor(true, true);
    done.onclick = apply.onclick = () => closeEditor();
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeEditor(true, true); }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); closeEditor(); }
    });
    updateCount(); doc.body.append(panel); source.setAttribute('aria-expanded', 'true');
    positionEditor(); text.focus({preventScroll:true}); text.setSelectionRange(text.value.length, text.value.length);
  }
  function enhance(source) {
    if (enhanced.has(source) || source.closest('.standard-text-editor') || source.dataset.inputProxy != null) return;
    const key = identity(source);
    const format = source.dataset.inputFormat || inputFormat({ key, label: label(source) });
    if (source.tagName === 'TEXTAREA') {
      if (!source.closest('.standard-data-table')) return;
      source.classList.add('standard-long-text'); source.rows = 1;
      source.setAttribute('aria-haspopup', 'dialog'); source.setAttribute('aria-expanded', 'false');
      source.setAttribute('aria-controls', `standard-text-editor-${++sequence}`);
      source.addEventListener('click', () => openEditor(source));
      source.addEventListener('keydown', event => {
        if (['Enter', 'ArrowDown'].includes(event.key) && !source.readOnly) { event.preventDefault(); openEditor(source); }
      });
      enhanced.set(source, {});
    } else if(source.type==='date') {
      enhanced.set(source,enhanceDateInput(source,label(source)));
    } else if (source.type === 'number' && format === 'quantity') {
      source.step = '1'; source.inputMode = 'numeric'; source.classList.add('standard-quantity-field'); enhanced.set(source, {});
      // Native step is anchored to min: a legacy min=0.0001 must not make 1 invalid.
      if (source.min !== '') source.min = String(Math.ceil(Number(source.min)));
      if (source.max !== '') source.max = String(Math.floor(Number(source.max)));
    } else if (source.type === 'number' && ['money', 'percent'].includes(format)) {
      const wrapper = doc.createElement('span'); wrapper.className = 'standard-number-field';
      source.before(wrapper); wrapper.append(source);
      const proxy = doc.createElement('input'); proxy.type = 'text'; proxy.inputMode = 'decimal';
      proxy.dataset.inputProxy = ''; proxy.className = source.className;
      proxy.setAttribute('aria-label', label(source)); proxy.placeholder = format === 'money' ? '0,00' : source.placeholder;
      const suffix = doc.createElement('span'); suffix.className = 'standard-input-unit';
      suffix.textContent = format === 'money' ? 'R$' : '%'; suffix.setAttribute('aria-hidden', 'true');
      wrapper.append(proxy, suffix); wrapper.dataset.format = format;
      source.classList.add('standard-input-native'); source.tabIndex = -1; source.setAttribute('aria-hidden', 'true');
      const precision = Number(source.dataset.moneyPrecision || 2);
      if (format === 'money') source.step = String(10 ** -precision);
      const sync = () => {
        proxy.disabled = source.disabled; proxy.readOnly = source.readOnly;
        proxy.value = localizedNumber(source.value, format, doc.activeElement === proxy, precision);
      };
      let enteringWithPointer = false;
      proxy.addEventListener('pointerdown', () => { enteringWithPointer = doc.activeElement !== proxy; });
      proxy.addEventListener('focus', () => {
        if (proxy.readOnly) return;
        // Keep zero as a valid filter value; select the current amount for easy replacement.
        proxy.value = source.value === '' ? '' : localizedNumber(source.value, format, true, precision);
        if (!proxy.readOnly) proxy.select();
      });
      proxy.addEventListener('mouseup', event => {
        if (enteringWithPointer && !proxy.readOnly) { event.preventDefault(); proxy.select(); }
        enteringWithPointer = false;
      });
      proxy.addEventListener('input', () => {
        const value = parseLocalizedNumber(proxy.value, format, precision);
        const message = value === null ? (format === 'money' ? `Use um valor como 1.234,56, com até ${precision === 4 ? 'quatro' : 'duas'} casas decimais.` : 'Informe um número válido.') : '';
        source.setCustomValidity(message); proxy.setCustomValidity(message);
        if (value !== null) { source.value = value; emit(source, 'input'); }
      });
      proxy.addEventListener('change', () => emit(source, 'change'));
      proxy.addEventListener('blur', () => { if (source.validity.valid) sync(); });
      source.addEventListener('input', () => { if (doc.activeElement !== proxy) sync(); });
      source.addEventListener('change', () => { if (doc.activeElement !== proxy) sync(); });
      source.addEventListener('focus', () => proxy.focus({preventScroll:true}));
      source.addEventListener('invalid', event => { event.preventDefault(); proxy.focus(); proxy.setCustomValidity(source.validationMessage); proxy.reportValidity(); });
      enhanced.set(source, { sync }); sync();
    }
    if (source.dataset.inputGenerator && !source.closest('.standard-generated-field')) {
      const wrapper = doc.createElement('span'); wrapper.className = 'standard-generated-field';
      source.before(wrapper); wrapper.append(source);
      const button = doc.createElement('button'); button.type = 'button'; button.className = 'standard-generate-button';
      button.setAttribute('aria-label', 'Gerar pedido único'); button.dataset.tooltip = 'Gerar pedido único';
      button.innerHTML = '<svg viewBox="0 0 24 24" class="stroke-icon" aria-hidden="true"><path d="M3 7h3c5 0 7 10 12 10h3m-4-4 4 4-4 4M3 17h3c2 0 3-2 4-4m4-2c1-2 2-4 4-4h3m-4-4 4 4-4 4"/></svg>';
      wrapper.append(button);
      const sync = () => { button.disabled = source.disabled || source.readOnly; };
      button.onclick = async () => {
        button.disabled = true; button.setAttribute('aria-busy', 'true');
        try {
          if (!generate) throw new Error('Geração de código indisponível.');
          const original = source.value;
          for (let attempt = 0; attempt < 20; attempt++) {
            const value = await generate(source.dataset.inputGenerator);
            if (!source.isConnected || source.disabled || source.readOnly || source.value !== original) return;
            const duplicate = [...root.querySelectorAll('[data-input-generator]')].some(other => other !== source && other.value.toUpperCase() === value.toUpperCase());
            if (duplicate) continue;
            source.value = value; emit(source, 'input'); emit(source, 'change'); source.focus(); return;
          }
          throw new Error('Não foi possível gerar um código diferente. Tente novamente.');
        } catch (error) { notify(error.message); }
        finally { button.removeAttribute('aria-busy'); sync(); }
      };
      enhanced.set(source, { sync }); sync();
    }
  }
  const scan = node => {
    if (node.nodeType !== 1) return;
    if (node.matches('input, textarea')) enhance(node);
    node.querySelectorAll('input, textarea').forEach(enhance);
    fitTableInputs(node);
  };
  const fitTableInput = source => {
    if (!source.matches?.('input') || source.classList.contains('standard-input-native') || !source.closest('.standard-data-table td')) return;
    const width = `max(150px, calc(${Math.max(10, [...(source.value || source.placeholder || '')].length)}em + 52px))`;
    source.style.setProperty('--table-input-width', width);
    const wrapper = source.closest('.standard-number-field, .standard-generated-field');
    wrapper?.style.setProperty('--table-input-width', width);
  };
  const fitTableInputs = node => {
    fitTableInput(node);
    node.querySelectorAll?.('input').forEach(fitTableInput);
  };
  const resizeInput = event => { fitTableInput(event.target); fitTableInputs(event.target.parentElement); };
  const observer = new win.MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') enhanced.get(mutation.target)?.sync?.();
      else mutation.addedNodes.forEach(scan);
    }
    if (editor && (!editor.source.isConnected || editor.source.disabled || editor.source.readOnly)) closeEditor(false);
  });
  scan(root);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'readonly', 'required'] });
  const outside = event => { if (editor && !editor.panel.contains(event.target) && event.target !== editor.source) closeEditor(false); };
  const validate = event => {
    if (event.type === 'click' && !event.target.closest('#formSaveButton, [data-table-control="save"]')) return;
    const scope = event.type === 'submit' ? event.target : event.target.closest('.form-page, .data-page') || root;
    const invalid = [...scope.querySelectorAll('.standard-input-native, .standard-quantity-field')].find(source => !source.disabled && !source.checkValidity());
    if (invalid) { event.preventDefault(); event.stopImmediatePropagation(); invalid.reportValidity(); }
  };
  doc.addEventListener('pointerdown', outside);
  root.addEventListener('input', resizeInput); root.addEventListener('change', resizeInput);
  doc.addEventListener('click', validate, true); doc.addEventListener('submit', validate, true);
  win.addEventListener('resize', positionEditor); win.addEventListener('scroll', positionEditor, true);
  win.visualViewport?.addEventListener('resize', positionEditor);
  return { refresh: () => scan(root), destroy: () => {
    observer.disconnect(); closeEditor(false); doc.removeEventListener('pointerdown', outside);
    root.removeEventListener('input', resizeInput); root.removeEventListener('change', resizeInput);
    doc.removeEventListener('click', validate, true); doc.removeEventListener('submit', validate, true);
    win.removeEventListener('resize', positionEditor); win.removeEventListener('scroll', positionEditor, true);
    win.visualViewport?.removeEventListener('resize', positionEditor);
  } };
}
