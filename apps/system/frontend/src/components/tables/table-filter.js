import { openTableActionCard } from './table-action-card.js';
import { escapeHtml } from '../formatters.js';
import { inputMetadata, inputFormat } from '../forms/input-semantics.js';

const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();

// Listing visibility only: inactive records remain excluded unless explicitly requested.
// Do not use this helper for relationship options, calculations or permissions.
export function tableStatusRows(records, values = {}) {
  return records.filter(record => values.status === 'inactive' ? record.status === 'inactive' : record.status !== 'inactive');
}

// Descriptors are the same visible columns used to draw the table. Compound
// cells supply their displayed value; relationships use IDs, never labels.
export function filterTableRows(records, fields, values = {}) {
  return records.filter(record => fields.every(field => {
    const wanted = values[field.key];
    if (wanted === undefined || wanted === '') return true;
    if (wanted === '__empty__' && field.filterEmpty === false) return true;
    const actual = field.filterValue ? field.filterValue(record) : field.type === 'compound' && field.display ? field.display(record) : record[field.key] ?? field.display?.(record);
    return (Array.isArray(actual) ? actual : [actual]).some(value => {
      if (wanted === '__empty__') return value == null || value === '';
      if (['organizationId', 'organizationSubId'].includes(field.key) && (value == null || value === '')) return true;
      const type = field.filterType || field.type;
      if (type === 'date' && typeof wanted === 'object') return Boolean(value) && (!wanted.from || value >= wanted.from) && (!wanted.to || value <= wanted.to);
      if (type === 'number') return value != null && value !== '' && (inputFormat(field)==='money' ? Math.round(Number(value)*10**(field.precision||2))===Math.round(Number(wanted)*10**(field.precision||2)) : Number(value)===Number(wanted));
      if (type === 'select' || type === 'date') return String(value ?? '') === String(wanted);
      return normalize(value).includes(normalize(wanted));
    }) || (wanted === '__empty__' && Array.isArray(actual) && !actual.length);
  }));
}

let closeCurrent = null;

export function bindTableFilter(context, { fields, values = {}, onApply }) {
  fields = fields.map(field => ({ ...field, type: field.filterType || field.type, options: field.filterOptions || field.options }));
  const trigger = context.root.querySelector('[data-table-control="filter"]');
  if (!trigger) return;
  const active = Object.fromEntries(fields.filter(field => values[field.key] !== undefined && values[field.key] !== '' && !(field.filterEmpty===false && values[field.key]==='__empty__')).map(field => [field.key, values[field.key]]));
  const count = Object.keys(active).length;
  trigger.classList.toggle('active', count > 0);
  trigger.querySelector('span').textContent = count ? `Filtrar (${count})` : 'Filtrar';
  trigger.setAttribute('aria-label', count ? `Filtrar tabela: ${count} filtro(s) aplicado(s)` : 'Filtrar tabela');
  trigger.onclick = () => {
    if (trigger.disabled) return;
    if (trigger.getAttribute('aria-expanded') === 'true') { closeCurrent?.(); return; }
    closeCurrent?.();
    const panel = document.createElement('form');
    panel.className = 'standard-table-filter';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Filtrar tabela');
    panel.innerHTML = `<header><strong>Filtrar tabela</strong><button type="button" class="row-icon-action" data-filter-close aria-label="Fechar filtro">×</button></header><p>Combine colunas para encontrar registros.</p><div data-filter-rows></div><button type="button" class="table-tool" data-filter-add>+ Adicionar filtro</button><footer><button type="button" class="form-action secondary" data-filter-clear>Limpar</button><button type="button" class="form-action secondary" data-filter-cancel>Cancelar</button><button type="submit" class="form-action primary">Aplicar</button></footer>`;
    const container = panel.querySelector('[data-filter-rows]');
    let rules = Object.entries(active).flatMap(([key, value]) => typeof value === 'object'
      ? Object.entries(value).map(([bound, date]) => ({ key, value: date, bound }))
      : fields.find(field => field.key === key)?.type === 'date' && value !== '__empty__'
        ? [{ key, value, bound: 'from' }, { key, value, bound: 'to' }] : [{ key, value }]);
    if (!rules.length && fields.length) rules.push({ key: fields[0].key, value: '' });
    const capacity = field => field.type === 'date' ? 2 : 1;
    const available = (field, except = -1) => rules.filter((rule, index) => index !== except && rule.key === field.key).length < capacity(field);
    const ruleFor = (key, except = -1) => ({ key, value: '', ...(fields.find(field => field.key === key).type === 'date' ? { bound: rules.some((rule, index) => index !== except && rule.key === key && rule.bound === 'from') ? 'to' : 'from' } : {}) });
    if (rules[0] && fields.find(field => field.key === rules[0].key).type === 'date' && !rules[0].bound) rules[0].bound = 'from';
    function focusValue(index = 0) {
      window.requestAnimationFrame(() => {
        if (!panel.isConnected) return;
        const input = container.querySelector(`[data-filter-rule="${index}"] [data-filter-value]`);
        (input?.closest('.standard-select')?.querySelector('button') || input)?.focus();
      });
    }
    function drawRules() {
      container.innerHTML = rules.map((rule, index) => {
        const field = fields.find(item => item.key === rule.key);
        const pairedDate = field.type === 'date' && rules.filter(item => item.key === rule.key).length === 2;
        const valueLabel = field.type === 'date' ? pairedDate ? rule.bound === 'to' ? 'Data fim' : 'Data início' : 'Data' : field.type === 'select' ? 'Opção' : field.type === 'number' ? 'Igual a' : 'Contém';
        const options = field.options?.filter(option => option.value !== '' && !option.hidden) || [];
        const control = field.type === 'select'
          ? `<select data-filter-value data-field-key="${escapeHtml(field.key)}" aria-label="Valor para ${escapeHtml(field.label)}"><option value="">Todos</option>${field.filterEmpty===false?'':`<option value="__empty__" ${rule.value === '__empty__' ? 'selected' : ''}>Sem preenchimento</option>`}${options.map(option => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(rule.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select>`
          : `<input data-filter-value ${inputMetadata({ ...field, generator: null })} aria-label="${field.type === 'date' ? `${valueLabel} para` : 'Valor para'} ${escapeHtml(field.label)}" type="${['number','date'].includes(field.type) ? field.type : 'text'}" ${field.type === 'number' ? 'step="any"' : ''} value="${escapeHtml(rule.value)}" placeholder="${field.type === 'number' ? 'Igual a' : 'Contém…'}">`;
        return `<div class="table-filter-rule" data-filter-rule="${index}"><label class="form-field"><span>Coluna</span><select data-filter-column aria-label="Coluna do filtro">${fields.map(item => `<option value="${escapeHtml(item.key)}" ${item.key === rule.key ? 'selected' : ''} ${!available(item, index) ? 'disabled' : ''}>${escapeHtml(item.label)}</option>`).join('')}</select></label><label class="form-field"><span>${valueLabel}</span>${control}</label><button type="button" class="row-icon-action" data-filter-remove aria-label="Remover filtro de ${escapeHtml(field.label)}">×</button>${inputFormat(field)==='money'?'<small class="money-filter-hint">Ex.: 1.234,56 · débito: -1.234,56</small>':''}</div>`;
      }).join('');
      for (const row of container.querySelectorAll('[data-filter-rule]')) {
        const index = Number(row.dataset.filterRule);
        row.querySelector('[data-filter-column]').onchange = event => { rules[index] = ruleFor(event.target.value, index); drawRules(); focusValue(index); };
        row.querySelector('[data-filter-value]').oninput = row.querySelector('[data-filter-value]').onchange = event => { rules[index].value = event.target.value; container.querySelectorAll('[data-invalid-period]').forEach(input => {input.setCustomValidity('');delete input.dataset.invalidPeriod;}); };
        row.querySelector('[data-filter-remove]').onclick = () => { rules.splice(index, 1); drawRules(); panel.querySelector('[data-filter-add]').focus(); };
      }
      panel.querySelector('[data-filter-add]').disabled = !fields.some(field => available(field));
      position();
    }
    const { close, position } = openTableActionCard({ panel, trigger, context, onClose: () => { if (closeCurrent === close) closeCurrent = null; } });
    closeCurrent = close;
    drawRules();
    panel.querySelector('[data-filter-add]').onclick = () => { const field = fields.find(item => item.key === rules.at(-1)?.key && available(item)) || fields.find(item => available(item)); if (field) { rules.push(ruleFor(field.key)); drawRules(); focusValue(rules.length - 1); } };
    panel.querySelector('[data-filter-close]').onclick = panel.querySelector('[data-filter-cancel]').onclick = () => close();
    panel.querySelector('[data-filter-clear]').onclick = () => { close(); onApply({}); };
    panel.onsubmit = event => {
      event.preventDefault();
      const result = {};
      for (const rule of rules.filter(rule => String(rule.value).trim() !== '')) {
        if (rule.bound) result[rule.key] = { ...result[rule.key], [rule.bound]: rule.value };
        else result[rule.key] = rule.value;
      }
      const invalid = rules.findIndex(rule => result[rule.key]?.from > result[rule.key]?.to);
      if (invalid >= 0) {
        const input = container.querySelector(`[data-filter-rule="${invalid}"] input`);
        input.dataset.invalidPeriod='';
        input.setCustomValidity('A data fim deve ser igual ou posterior à data início.');
        input.reportValidity(); return;
      }
      close(); onApply(result);
    };
    focusValue();
  };
}
