import { escapeHtml } from '../formatters.js';

export function confirmDestructiveAction({ title = 'Excluir cadastro?', message, actionLabel = 'Excluir', warning = 'Essa ação não pode ser desfeita.', tone = /excluir|remover|negar|reprovar/i.test(actionLabel) ? 'critical' : 'simple' }) {
  if (document.querySelector('.confirmation-backdrop')) return Promise.resolve(false);
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const backdrop = document.createElement('div');
    backdrop.className = `confirmation-backdrop confirmation-${tone === 'critical' ? 'critical' : 'simple'}`;
    backdrop.innerHTML = `<div class="confirmation-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirmationTitle" aria-describedby="confirmationDescription">
      <div class="confirmation-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2 1.8 20h20.4L12 2Zm0 5 1 8h-2l1-8Zm0 11a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z"/></svg></div>
      <div class="confirmation-copy"><h2 id="confirmationTitle">${escapeHtml(title)}</h2><p id="confirmationDescription">${escapeHtml(message)}</p><strong>${escapeHtml(warning)}</strong></div>
      <div class="confirmation-actions"><button class="form-action secondary" type="button" data-confirm-cancel>Cancelar</button><button class="form-action destructive" type="button" data-confirm-delete>${escapeHtml(actionLabel)}</button></div>
    </div>`;
    const finish = value => {
      document.removeEventListener('keydown', keyboard);
      backdrop.remove();
      if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
      resolve(value);
    };
    const keyboard = event => {
      if (event.key === 'Escape') { event.preventDefault(); finish(false); }
      if (event.key === 'Tab') {
        const buttons = [...backdrop.querySelectorAll('button')];
        const target = event.shiftKey ? buttons[0] : buttons.at(-1);
        if (document.activeElement === target || !backdrop.contains(document.activeElement)) {
          event.preventDefault(); (event.shiftKey ? buttons.at(-1) : buttons[0]).focus({preventScroll:true});
        }
      }
    };
    backdrop.querySelector('[data-confirm-cancel]').addEventListener('click', () => finish(false));
    backdrop.querySelector('[data-confirm-delete]').addEventListener('click', () => finish(true));
    backdrop.addEventListener('click', event => { if (event.target === backdrop) finish(false); });
    document.body.append(backdrop);
    document.addEventListener('keydown', keyboard);
    backdrop.querySelector('[data-confirm-cancel]').focus({preventScroll:true});
  });
}
