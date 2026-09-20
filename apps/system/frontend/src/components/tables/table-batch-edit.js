import { escapeHtml } from '../formatters.js';
import { openTableActionCard } from './table-action-card.js';
import { inputMetadata } from '../forms/input-semantics.js';
const currentPageAccess = () => ({ approve: true });

export function requestBatchEdit({ title = 'Editar selecionados', fields, context }) {
  fields = fields.filter(field => field.readOnly !== true && field.batch !== false);
  if (!currentPageAccess().approve) fields = fields.filter(field =>
    !(['status','recordStatus'].includes(field.key) && field.options?.some(option => option.value === 'active')));
  if (!fields.length) { context?.notify('Não há colunas editáveis em comum nos registros selecionados.'); return Promise.resolve(null); }
  return new Promise(resolve => {
    const trigger = context?.root.querySelector('[data-table-control="edit"]') || document.querySelector('[data-table-control="edit"]');
    const count = Number(trigger?.closest('.standard-data-table')?.dataset.tableSelected || 0);
    const panel = document.createElement('form');
    panel.className = 'batch-edit-card';
    panel.setAttribute('aria-label', title);
    panel.innerHTML = `<header><strong>${escapeHtml(title)}</strong><button type="button" class="row-icon-action" data-batch-close aria-label="Fechar edição">×</button></header>
      <p>${count} registros selecionados. Escolha a coluna e o preenchimento.</p>
      <div class="table-batch-fields"><label class="form-field"><span>Coluna</span><select data-batch-field aria-label="Coluna a editar">${fields.map(field => `<option value="${escapeHtml(field.key)}">${escapeHtml(field.label)}</option>`).join('')}</select></label>
      <div data-batch-value></div></div>
      <footer><button class="form-action secondary" type="button" data-batch-cancel>Cancelar</button><button class="form-action primary" type="submit" data-batch-apply>Confirmar edição</button></footer>`;
    let result = null;
    const { close, position } = openTableActionCard({ panel, trigger, context, align: 'start', onClose: () => resolve(result) });
    const fieldSelect = panel.querySelector('[data-batch-field]');
    const valueContainer = panel.querySelector('[data-batch-value]');
    const renderValue = () => {
      const field = fields.find(item => item.key === fieldSelect.value);
      if (!field) return;
      if (field.control) {
        valueContainer.innerHTML = field.control({}, key => `data-batch-key="${key}"`);
        field.bind?.(valueContainer);
      } else {
        valueContainer.innerHTML = `<label class="form-field"><span>Preencher em lote</span>${field.type === 'select'
          ? `<select data-batch-input data-field-key="${escapeHtml(field.key)}" aria-label="Preencher em lote" ${field.required ? 'required' : ''}>${field.options.map(option => `<option value="${escapeHtml(option.value)}" ${option.preserveOnly ? 'disabled' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select>`
          : field.type === 'textarea' ? `<textarea data-batch-input data-field-key="${escapeHtml(field.key)}" aria-label="Preencher em lote" rows="1" maxlength="${field.max || 4000}"></textarea>`
          : `<input data-batch-input data-field-key="${escapeHtml(field.key)}" ${inputMetadata(field)} aria-label="Preencher em lote" required type="${['number','date','email'].includes(field.type) ? field.type : 'text'}" ${field.max ? `maxlength="${field.max}"` : ''} ${field.type === 'number' ? `min="${field.min ?? 0}" step="${field.step ?? 0.01}" ${field.maxValue ? `max="${field.maxValue}"` : ''}` : ''} placeholder="${escapeHtml(field.placeholder || '')}">`}</label>`;
      }
      position();
      window.requestAnimationFrame(() => {
        if (!panel.isConnected) return;
        const input = valueContainer.querySelector('input:not([type="hidden"]), select:not(:disabled)');
        (input?.closest('.standard-select')?.querySelector('button') || input)?.focus();
      });
    };
    fieldSelect.onchange = renderValue;
    panel.querySelector('[data-batch-cancel]').onclick = panel.querySelector('[data-batch-close]').onclick = () => close();
    panel.onsubmit = event => {
      event.preventDefault();
      const controls = [...panel.querySelectorAll('[data-batch-key]:not(:disabled)')];
      const input = panel.querySelector('[data-batch-input]');
      const invalid = (controls.length ? controls : [input]).find(control => !control.checkValidity());
      if (invalid) return invalid.reportValidity();
      result = controls.length
        ? { field: fieldSelect.value, values: Object.fromEntries(controls.map(control => [control.dataset.batchKey, control.value])) }
        : { field: fieldSelect.value, value: input.value };
      close();
    };
    renderValue();
  });
}
