// Semantic types are presentation metadata; API values remain plain decimals.
const moneyKeys = new Set(['amount', 'price', 'totalValue', 'unitValue', 'fixedCompensation', 'variableCompensation', 'compensation', 'cashValue']);
const quantityKeys = new Set(['quantity', 'installmentNumber', 'participantCount', 'fileCount']);
export function inputFormat(field) {
  if (field.format) return field.format;
  if (moneyKeys.has(field.key)) return 'money';
  if (quantityKeys.has(field.key)) return 'quantity';
  if (/Percent$/.test(field.key || '') || /\(%\)/.test(field.label || '')) return 'percent';
  if (/\(R\$\)/.test(field.label || '')) return 'money';
  return '';
}
export function inputMetadata(field) {
  const format = inputFormat(field);
  return `${format ? `data-input-format="${format}"` : ''} ${field.precision ? `data-money-precision="${field.precision}"` : ''} ${field.generator === 'sale-order' ? 'data-input-generator="sale-order"' : ''}`;
}
export function parseLocalizedNumber(value, format = '', precision = 2) {
  const text = String(value).trim().replace(/−/g, '-').replace(/^(?:R\$\s*([+-]?)|([+-]?)\s*R\$)\s*/i, '$1$2').replace(/%$/, '').replace(/\s/g, '');
  if (!text) return '';
  if (text.includes(',') && !/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d*$/.test(text)) return null;
  // Brazilian paste (1.234,56), simple decimal-dot paste (1234.56), or plain integer.
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.')
    : format === 'money' && /^-?\d{1,3}(\.\d{3})+$/.test(text) ? text.replace(/\./g, '') : text;
  if (!/^-?\d+(\.\d*)?$/.test(normalized) || !Number.isFinite(Number(normalized))) return null;
  if (format === 'money' && !new RegExp(`^-?\\d+(\\.\\d{0,${precision}})?$`).test(normalized)) return null;
  return normalized;
}
export function localizedNumber(value, format, editing = false, precision = 2) {
  if (value === '' || value == null) return '';
  return new Intl.NumberFormat('pt-BR', {
    useGrouping: !editing, minimumFractionDigits: format === 'money' ? 2 : 0,
    maximumFractionDigits: format === 'money' ? precision : 8
  }).format(Number(value));
}
