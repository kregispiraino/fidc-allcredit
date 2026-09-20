import { escapeHtml } from '../formatters.js';

import { renderTableText } from './table-text.js';
// Local operational app: advanced authentication is outside this phase.
const currentPageAccess = () => ({ create: true, edit: true, remove: true, export: true, approve: true });

export function renderStandardDataTable({
  tabs = [],
  modalEditing = false,
  activeTab,
  primaryLabel = 'Cadastro rápido',
  showNew = true,
  toolbarActions = [],
  showEdit = showNew,
  showDuplicate = showNew && showEdit,
  showImport = true,
  showExport = true,
  showFilter = true,
  editing = false,
  creating = false,
  selectedCount = 0,
  currentPage = 1,
  totalPages = 1,
  columns,
  rowsHtml,
  emptyMessage,
  recordLabel = 'registro(s)'
}) {
  const access = currentPageAccess();
  showNew = showNew && access.create;
  showEdit = showEdit && access.edit;
  showDuplicate = showDuplicate && access.create;
  showImport = showImport && access.create;
  showExport = showExport && access.export;
  toolbarActions = access.approve ? toolbarActions : [];
  const tableEditingEnabled = showEdit;
  const showEditActions = tableEditingEnabled || creating && access.create;
  return `<div class="data-card standard-data-table" data-table-editing="${editing || creating}" data-table-selected="${selectedCount}">
    ${tabs.length ? `<div class="sheet-tabs" aria-label="Visualizações da tabela">
      <button class="sheet-tab-nav" type="button" data-table-control="previous-tab" aria-label="Ver abas anteriores">${strokeIcon('m14.5 6-6 6 6 6')}</button>
      <div class="sheet-tabs-viewport" data-table-tabs-viewport role="tablist">
        <div class="sheet-tabs-track">${tabs.filter(tab => !tab.disabled).map(tab => renderTab(tab, activeTab)).join('')}</div>
      </div>
      <button class="sheet-tab-nav" type="button" data-table-control="next-tab" aria-label="Ver próximas abas">${strokeIcon('m9.5 6 6 6-6 6')}</button>
    </div>
    ` : ''}<div class="table-toolbar">
      <div class="table-toolbar-left">
        ${toolbarActions.map(action => `<button class="table-tool" type="button" data-table-action="${escapeHtml(action.key)}" ${editing || action.disabled ? 'disabled' : ''}>${strokeIcon(action.icon || 'm5 12 4 4L19 6')}<span>${escapeHtml(action.label)}</span></button>`).join('')}
        ${showNew ? `<button class="table-tool table-primary-action" type="button" data-table-control="new" aria-description="${escapeHtml(primaryLabel)}">${filledIcon('M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z')}<span>${escapeHtml(primaryLabel)}</span></button>` : ''}
        ${showNew && showEditActions ? '<span class="toolbar-separator"></span>' : ''}
        ${showEditActions ? `<button class="table-tool" type="button" data-table-control="edit">${editing || creating ? strokeIcon('m6 6 12 12M18 6 6 18') : filledIcon('m16.9 3.7 3.4 3.4L9 18.4 4.4 19.6 5.6 15 16.9 3.7Zm-1.4 3.4L7.3 15.3l-.5 1.9 1.9-.5 8.2-8.2-1.4-1.4Z')}<span>${editing || creating ? 'Cancelar' : selectedCount > 1 ? 'Editar selecionados' : 'Editar'}</span></button>
        ${modalEditing ? '' : `<button class="table-tool" type="button" data-table-control="save" ${editing || creating ? '' : 'disabled'}>${filledIcon('M5 3h12.6L21 6.4V21H3V3h2Zm0 2v14h14V7.2L16.8 5H16v5H7V5H5Zm4 0v3h5V5H9Zm-1 8h8v4H8v-4Z')}<span>Salvar</span></button>`}` : ''}
        ${showDuplicate ? `<button class="table-tool" type="button" data-table-control="duplicate" ${editing || creating ? 'disabled' : ''}>${strokeIcon('M9 9h11v11H9V9ZM15 5V3H3v12h2')}<span>${selectedCount > 1 ? 'Duplicar selecionados' : 'Duplicar'}</span></button>` : ''}
        ${tableEditingEnabled ? '<span class="toolbar-separator"></span>' : ''}
        ${tableEditingEnabled ? `<button class="table-tool" type="button" data-table-control="select-all">${filledIcon('M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm0 2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H6Zm2.7 6 2.1 2.1 4.5-4.5 1.4 1.4-5.9 5.9L7.3 12.4 8.7 11Z')}<span>${selectedCount ? `Desmarcar ${selectedCount} registros` : 'Selecionar todos'}</span></button>` : ''}
      </div>
      <div class="table-toolbar-right">
        <div class="table-pagination" aria-label="Paginação da tabela">
          <button class="page-nav" type="button" data-table-control="previous-page" ${currentPage <= 1 ? 'disabled' : ''} aria-label="Página anterior">${strokeIcon('m14.5 6-6 6 6 6')}</button>
          <div class="page-indicator"><strong>${currentPage}</strong> / ${totalPages}</div>
          <button class="page-nav" type="button" data-table-control="next-page" ${currentPage >= totalPages ? 'disabled' : ''} aria-label="Próxima página">${strokeIcon('m9.5 6 6 6-6 6')}</button>
        </div>
        ${showImport ? `<button class="table-tool" type="button" data-table-control="import">${filledIcon('M11 4h2v9.2l3.1-3.1 1.4 1.4L12 17l-5.5-5.5 1.4-1.4 3.1 3.1V4ZM5 19h14v2H5v-2Z')}<span>Importar</span></button>` : ''}
        ${showExport ? `<button class="table-tool" type="button" data-table-control="export">${filledIcon('M11 20h2v-9.2l3.1 3.1 1.4-1.4L12 7l-5.5 5.5 1.4-1.4 3.1-3.1V20ZM5 3h14v2H5V3Z')}<span>Exportar</span></button>` : ''}
        ${showFilter?`<button class="table-tool" type="button" data-table-control="filter" aria-label="Filtrar tabela" aria-haspopup="dialog" aria-expanded="false" ${editing || creating ? 'disabled' : ''}>${filledIcon('M4 5h16l-6 7v6l-4 2v-8L4 5Z')}<span>Filtrar</span></button>`:''}
      </div>
    </div>
    <div class="table-scroll"><table class="data-table manager-table">
      <thead><tr><th class="row-actions-column">Ações</th>${columns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="${columns.length + 1}"><div class="empty-table">${escapeHtml(emptyMessage)}</div></td></tr>`}</tbody>
    </table></div>
    <div class="table-footer"><span class="selection-summary" ${tableEditingEnabled ? '' : 'hidden'}>${selectedCount ? `${selectedCount} selecionado(s)` : 'Nenhum registro selecionado'}</span><span class="table-hint">${editing ? 'Edite os campos e clique em Salvar.' : `${recordLabel} exibidos conforme os filtros.`}</span></div>
  </div>`;
}

export function renderRowActions(id, selected = false, { selectable = true, editable = true, deletable = true, deleteDisabled = false, deleteLabel = 'Excluir', duplicate = false } = {}) {
  const access = currentPageAccess();
  editable = editable && access.edit;
  selectable = selectable && access.edit;
  deletable = deletable && access.remove;
  duplicate = duplicate && access.create;
  return `<div class="compact-row-actions">
    ${selectable ? `<button class="row-icon-action ${selected ? 'selected' : ''}" type="button" data-row-select="${id}" aria-pressed="${selected}" aria-label="${selected ? 'Desmarcar' : 'Selecionar'} registro" data-tooltip="${selected ? 'Desmarcar' : 'Selecionar'}">${selectionIcon(selected)}</button>` : ''}
    ${editable ? `<button class="row-icon-action" type="button" data-row-edit="${id}" aria-label="Editar" data-tooltip="Editar">${filledIcon('m16.9 3.7 3.4 3.4L9 18.4 4.4 19.6 5.6 15 16.9 3.7Zm-1.4 3.4L7.3 15.3l-.5 1.9 1.9-.5 8.2-8.2-1.4-1.4Z')}</button>` : ''}
    ${deletable ? `<button class="row-icon-action danger" type="button" data-row-delete="${id}" aria-label="${escapeHtml(deleteLabel)}" data-tooltip="${escapeHtml(deleteLabel)}" ${deleteDisabled ? 'disabled' : ''}>${filledIcon('M7 5V3h10v2h4v2h-2v14H5V7H3V5h4Zm2 0h6V4H9v1ZM7 7v12h10V7H7Zm3 2h2v8h-2V9Zm4 0h2v8h-2V9Z')}</button>` : ''}
    ${duplicate ? `<button class="row-icon-action" type="button" data-row-duplicate="${id}" aria-label="Duplicar" data-tooltip="Duplicar">${strokeIcon('M9 9h11v11H9V9ZM15 5V3H3v12h2')}</button>` : ''}
  </div>`;
}

export function renderEditableName(name, id, editing = false, placeholder = 'Informe o nome', field = 'name') {
  if (editing) return `<input class="inline-cell-control cell-main" data-inline-field="${escapeHtml(field)}" data-record-id="${id}" value="${escapeHtml(name)}" placeholder="${escapeHtml(placeholder)}">`;
  return `<span class="cell-main">${escapeHtml(name)}</span><span class="cell-sub">${id === 'draft' ? 'Novo cadastro' : `#${id}`}</span>`;
}

export function renderEditableValue(value, id, field, editing = false, { type = 'text', placeholder = '', display = null, format = '', precision = 2 } = {}) {
  if (!editing) return type === 'textarea' || ['description', 'details', 'notes', 'observation'].includes(field)
    ? renderTableText(value) : escapeHtml(display ?? value ?? '—');
  const attributes = `class="inline-cell-control" data-inline-field="${escapeHtml(field)}" data-record-id="${id}" placeholder="${escapeHtml(placeholder)}" ${format ? `data-input-format="${format}" data-money-precision="${precision}"` : ''}`;
  if (type === 'textarea' || ['description', 'details', 'notes', 'observation'].includes(field)) return `<textarea ${attributes} rows="1" maxlength="4000">${escapeHtml(value ?? '')}</textarea>`;
  return `<input ${attributes} type="${type}" value="${escapeHtml(value ?? '')}" ${type === 'number' ? 'min="0" step="0.01"' : ''}>`;
}

export function renderEditableSelect(value, id, field, options, editing = false, display = null) {
  if (['status','recordStatus'].includes(field) && options.some(option => option.value === 'active') && !currentPageAccess().approve) editing = false;
  if (!editing) return escapeHtml(display ?? options.find(option => String(option.value) === String(value))?.label ?? value ?? '—');
  return `<select class="inline-cell-control" data-inline-field="${escapeHtml(field)}" data-record-id="${id}">${options.map(option => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select>`;
}

export function inlineRecordValues(root, id) {
  return Object.fromEntries([...root.querySelectorAll(`[data-record-id="${id}"][data-inline-field]`)].map(control => [
    control.dataset.inlineField,
    control.multiple ? [...control.selectedOptions].map(option => option.value) : control.value
  ]));
}

export function prepareQuickRegistrationRow(root) {
  // Keep unrelated actions from redrawing the table and losing the draft.
  root.querySelectorAll('[data-row-select], [data-row-edit], [data-row-delete]:not([data-row-delete^="draft"]), [data-table-control="select-all"], [data-table-control="previous-page"], [data-table-control="next-page"], [data-table-control="import"], [data-table-control="export"]').forEach(button => { button.disabled = true; });
}

export function bindStandardDataTable(root, handlers = {}) {
  root.querySelectorAll('.table-tool').forEach(button => {
    const label = button.textContent.trim();
    if (label) { button.setAttribute('aria-label', label); button.dataset.tooltip = label; }
  });
  const bind = (selector, handler) => {
    if (handler) root.querySelector(selector)?.addEventListener('click', handler);
  };
  bind('[data-table-control="new"]', handlers.onNew);
  bind('[data-table-control="duplicate"]', () => runTableAction(root, handlers.onDuplicate, handlers.onError));
  root.querySelectorAll('[data-table-action]').forEach(button => button.addEventListener('click',
    () => runTableAction(root, () => handlers.onAction?.(button.dataset.tableAction), handlers.onError)));
  bind('[data-table-control="edit"]', () => {
    const table = root.querySelector('.standard-data-table');
    const batch = table.dataset.tableEditing !== 'true' && Number(table.dataset.tableSelected) > 1;
    return runTableAction(root, batch ? handlers.onBatch : handlers.onEdit, handlers.onError);
  });
  bind('[data-table-control="save"]', handlers.onSave && (async () => {
    const buttons = [...root.querySelectorAll('button')];
    const states = buttons.map(button => button.disabled);
    buttons.forEach(button => { button.disabled = true; });
    try { await handlers.onSave(); }
    finally { buttons.forEach((button, index) => { if (button.isConnected) button.disabled = states[index]; }); }
  }));
  bind('[data-table-control="select-all"]', () => runTableAction(root, handlers.onSelectAll, handlers.onError));
  if (root.querySelector('.standard-data-table')?.dataset.tableEditing === 'true') {
    root.querySelectorAll('[data-row-select], [data-table-control="select-all"]').forEach(button => { button.disabled = true; });
  }
  bind('[data-table-control="previous-page"]', handlers.onPreviousPage);
  bind('[data-table-control="next-page"]', handlers.onNextPage);
  bind('[data-table-control="import"]', handlers.onImport);
  bind('[data-table-control="export"]', handlers.onExport);
  root.querySelectorAll('[data-sheet-tab]').forEach(button => button.addEventListener('click', () => {
    if (!button.disabled) handlers.onTab?.(button.dataset.sheetTab);
  }));
  root.querySelectorAll('[data-row-select]').forEach(button => button.addEventListener('click', () => handlers.onRowSelect?.(button.dataset.rowSelect)));
  root.querySelectorAll('[data-row-edit]').forEach(button => button.addEventListener('click', () => handlers.onRowEdit?.(button.dataset.rowEdit)));
  root.querySelectorAll('[data-row-delete]').forEach(button => button.addEventListener('click', () => handlers.onRowDelete?.(button.dataset.rowDelete)));
  root.querySelectorAll('[data-row-duplicate]').forEach(button => button.addEventListener('click', () => handlers.onRowDuplicate?.(button.dataset.rowDuplicate)));

  const viewport = root.querySelector('[data-table-tabs-viewport]');
  const previous = root.querySelector('[data-table-control="previous-tab"]');
  const next = root.querySelector('[data-table-control="next-tab"]');
  const updateTabButtons = () => {
    if (!viewport) return;
    const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    previous.disabled = viewport.scrollLeft <= 2;
    next.disabled = viewport.scrollLeft >= max - 2;
  };
  previous?.addEventListener('click', () => { viewport.scrollBy?.({ left: -220, behavior: 'smooth' }); setTimeout(updateTabButtons, 260); });
  next?.addEventListener('click', () => { viewport.scrollBy?.({ left: 220, behavior: 'smooth' }); setTimeout(updateTabButtons, 260); });
  viewport?.addEventListener('scroll', updateTabButtons, { passive: true });
  window.requestAnimationFrame(updateTabButtons);
}

function renderTab(tab, activeTab) {
  const tooltip = tab.tooltip ? ` data-tooltip="${escapeHtml(tab.tooltip)}"` : '';
  return `<button class="sheet-tab ${activeTab === tab.key ? 'active' : ''}" type="button" data-sheet-tab="${escapeHtml(tab.key)}" role="tab" aria-selected="${activeTab === tab.key}" ${tab.disabled ? 'disabled' : ''}${tooltip}><span>${escapeHtml(tab.label)}</span></button>`;
}

function filledIcon(path) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
}

function strokeIcon(path) {
  return `<svg class="stroke-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
}

function selectionIcon(selected) {
  return strokeIcon(`M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z${selected ? ' m2 8 3 3 5-6' : ''}`);
}


export function updateTableSelection(root, count) {
  const table = root.querySelector('.standard-data-table');
  if (!table) return;
  table.dataset.tableSelected = count;
  table.querySelectorAll('[data-row-select]').forEach(button => {
    const selected = button.classList.contains('selected');
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `${selected ? 'Desmarcar' : 'Selecionar'} registro`);
    button.dataset.tooltip = selected ? 'Desmarcar' : 'Selecionar';
    button.innerHTML = selectionIcon(selected);
  });
  const editing = table.dataset.tableEditing === 'true';
  for (const [key, label] of [
    ['select-all', count ? `Desmarcar ${count} registros` : 'Selecionar todos'],
    ['edit', editing ? 'Cancelar' : count > 1 ? 'Editar selecionados' : 'Editar'],
    ['duplicate', count > 1 ? 'Duplicar selecionados' : 'Duplicar']
  ]) {
    const button = table.querySelector(`[data-table-control="${key}"]`);
    if (!button) continue;
    button.querySelector('span').textContent = label;
    button.setAttribute('aria-label', label); button.dataset.tooltip = label;
  }
  table.querySelector('.selection-summary').textContent = count ? `${count} selecionado(s)` : 'Nenhum registro selecionado';
}

async function runTableAction(root, action, onError) {
  if (!action) return;
  const buttons = [...root.querySelectorAll('.standard-data-table button')];
  const states = buttons.map(button => button.disabled);
  let result;
  try { result = action(); }
  catch (error) { onError?.(error); return; }
  if (!result?.then) return;
  buttons.forEach(button => { button.disabled = true; });
  try { await result; }
  catch (error) { if (onError) onError(error); else throw error; }
  finally { buttons.forEach((button, index) => { if (button.isConnected) button.disabled = states[index]; }); }
}
