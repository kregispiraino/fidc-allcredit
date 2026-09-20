let active = null;

// Shared anchored surface for table filters and bulk edits.
export function openTableActionCard({ panel, trigger, context, align = 'end', placement = 'below', maxWidth = 440, onClose = () => {} }) {
  active?.();
  let closed = false;
  const position = () => {
    if (!trigger?.isConnected) return close(false);
    const anchor = trigger.getBoundingClientRect();
    const width = Math.min(maxWidth, window.innerWidth - 24);
    const left = align === 'start' ? anchor.left : anchor.right - width;
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(12, Math.min(left, window.innerWidth - width - 12))}px`;
    const top=placement==='above'?anchor.top-panel.offsetHeight-8:anchor.bottom+8;
    panel.style.top = `${Math.max(12, Math.min(top, window.innerHeight - panel.offsetHeight - 12))}px`;
  };
  const close = (focus = true) => {
    if (closed) return;
    closed = true; panel.remove(); trigger?.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside);
    document.removeEventListener('keydown', keyboard);
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
    if (active === close) active = null;
    if (focus && trigger?.isConnected) trigger.focus({ preventScroll: true });
    onClose();
  };
  const outside = event => {
    if (!panel.contains(event.target) && !trigger?.contains(event.target) && !event.target.closest('.standard-select-menu, .standard-text-editor')) close(false);
  };
  const keyboard = event => {
    if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('.standard-select-menu, .standard-text-editor')) { event.preventDefault(); close(); }
  };
  active = close;
  panel.classList.add('standard-table-filter'); panel.setAttribute('role', 'dialog');
  context?.onCleanup?.(() => close(false));
  document.body.append(panel);
  trigger?.setAttribute('aria-expanded', 'true');
  position();
  document.addEventListener('pointerdown', outside); document.addEventListener('keydown', keyboard);
  window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
  return { close, position };
}
