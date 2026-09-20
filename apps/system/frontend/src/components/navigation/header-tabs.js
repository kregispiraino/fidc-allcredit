import { escapeHtml } from '../formatters.js';

import { renderOptionalTabAction, bindOptionalTabs } from './optional-tabs.js';

export function clearHeaderTabs(container, header) {
  if (!container) return;

  container.innerHTML = '';
  container.setAttribute('aria-hidden', 'true');
  header?.classList.remove('has-tabs');
}

export function renderHeaderTabs({
  container,
  header,
  tabs,
  activeKey,
  dataAttribute,
  onToggle
}) {
  if (!container) return;
  tabs = tabs.filter(([, , options = {}]) => !options.disabled);
  if (!tabs.length) {
    clearHeaderTabs(container, header);
    return;
  }

  container.setAttribute('aria-hidden', 'false');
  header?.classList.add('has-tabs');
  container.innerHTML = tabs
    .map(([key, label, options = {}]) => {
      const tooltip = options.tooltip ? escapeHtml(options.tooltip) : '';
      const action =
        options.optional && (!options.enabled || options.removable !== false)
          ? renderOptionalTabAction({
              key,
              label,
              enabled: options.enabled,
              disabled: options.locked
            })
          : '';
      if (options.optional && !options.enabled) return action;
      const tab = `<button type="button" class="header-tab ${activeKey === key ? 'active' : ''}" data-${dataAttribute}="${escapeHtml(key)}" ${options.disabled || options.locked ? 'disabled' : ''} ${tooltip ? `data-tooltip="${tooltip}"` : ''}>${escapeHtml(label)}</button>`;
      return action
        ? `<span class="optional-tab-group">${tab}${action}</span>`
        : tab;
    })
    .join('');
  bindOptionalTabs(container, onToggle);
}
