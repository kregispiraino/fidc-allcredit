import { inlineRecordValues } from './standard-data-table.js';

// Drafts live only in the current table. Capture before redrawing so that
// repeated clicks on New preserve every input, including custom selects.
export function createQuickRegistrationDrafts(defaults = {}) {
  let records = [];
  let sequence = 0;
  const capture = root => {
    records = records.map(record => ({ ...record, ...inlineRecordValues(root, record.id) }));
  };
  return {
    get length() { return records.length; },
    get records() { return records; },
    has: id => records.some(record => record.id === id),
    add(root) {
      capture(root);
      records.push({ status: 'active', ...defaults, id: sequence++ === 0 ? 'draft' : `draft-${sequence}` });
    },
    duplicate(root, rows, transform = row => row) {
      capture(root);
      for (const original of rows) {
        const { id, key, version, createdAt, updatedAt, password, passwordHash, files, ...values } = structuredClone(transform(original));
        records.push({ ...structuredClone(defaults), ...values, status: values.status ?? 'active', id: sequence++ === 0 ? 'draft' : `draft-${sequence}` });
      }
    },
    remove(root, id) { capture(root); records = records.filter(record => record.id !== id); },
    clear() { records = []; sequence = 0; },
    values(root) { capture(root); return records.map(({ id, ...values }) => values); },
    restore(root) {
      for (const record of records) {
        for (const control of root.querySelectorAll(`[data-record-id="${record.id}"][data-inline-field]`)) {
          const value = record[control.dataset.inlineField];
          if (value === undefined) continue;
          if (control.multiple) {
            for (const option of control.options) option.selected = value.map(String).includes(option.value);
          } else control.value = value ?? '';
          control.dispatchEvent(new window.Event('change', { bubbles: true }));
        }
      }
    }
  };
}
