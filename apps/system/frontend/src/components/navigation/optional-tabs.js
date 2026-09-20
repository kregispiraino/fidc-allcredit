import { escapeHtml } from '../formatters.js';

// One add/remove affordance for header tabs and embedded association tables.
export function renderOptionalTabAction({
  key,
  label,
  enabled,
  disabled = false
}) {
  return `<button type="button" class="optional-tab-action ${enabled ? 'optional-tab-remove' : 'optional-tab-add'}" data-optional-tab="${escapeHtml(key)}" data-optional-enabled="${!enabled}" aria-label="${enabled ? 'Remover' : 'Adicionar'} aba ${escapeHtml(label)}" ${disabled ? 'disabled' : ''}>${enabled ? '<span aria-hidden="true">−</span>' : `+ ${escapeHtml(label)}`}</button>`;
}

export function bindOptionalTabs(container, onToggle) {
  container.querySelectorAll('[data-optional-tab]').forEach((button) => {
    button.onclick = () => {
      if (!button.disabled)
        onToggle?.(
          button.dataset.optionalTab,
          button.dataset.optionalEnabled === 'true'
        );
    };
  });
}
