import { escapeHtml } from '../formatters.js';

// Adapted from Askora's renderMultiViewTopline / operationStats.
// All Credit supplies domain tabs and keeps filters in their table/panel.
export const operationIcon=path=>`<svg class="operation-stroke" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
export const operationStats=items=>items.map(([label,value])=>`<div class="task-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
const icons={rastreio:'M4 5h16v14H4zM8 9h8M8 13h5',extrato:'M6 3h12v18H6zM9 7h6M9 11h6M9 15h4',conciliacao:'M12 3v14m-5-5 5 5 5-5M4 20h16',liquidacao:'M12 17V3m-5 5 5-5 5 5M4 20h16',pendencias:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2'};
export function renderMultiViewTopline({tabs,activeKey,stats=[],label}) {
  return `<div class="task-topline operation-topline"><div class="task-topline-left"><div class="task-view-switch" role="group" aria-label="Abas de ${escapeHtml(label)}">${tabs.map(([key,text])=>`<button type="button" class="task-view-button ${key===activeKey?'active':''}" data-page-tab="${key}" aria-pressed="${key===activeKey}">${icons[key]?operationIcon(icons[key]):''}<span>${escapeHtml(text)}</span></button>`).join('')}</div></div><div class="operation-topline-right"><div class="task-overview" aria-label="Resumo da visualização">${operationStats(stats)}</div></div></div>`;
}
