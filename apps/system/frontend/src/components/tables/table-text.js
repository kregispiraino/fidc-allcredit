import { escapeHtml } from '../formatters.js';

export function renderTableText(value) {
  if (value == null || value === '') return '—';
  const text = escapeHtml(value);
  return `<span class="table-text-preview" tabindex="0" data-tooltip-format="text" data-tooltip="${text}">${text}</span>`;
}
