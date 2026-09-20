export { escapeHtml as esc } from '../components/formatters.js';
export const money=(value,subcentavos=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:4}).format((value*100+subcentavos)/10000);
export const date=value=>value?value.split('-').reverse().join('/'):'—';
export const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
export const statuses={pending:'Pendente',reconciled:'Conciliado',reversal:'Estorno',active:'Ativo',inactive:'Inativo'};
export const functions={operacional:'Operacional',neutra:'Neutra',rastreada:'Rastreada'};
export const statusOptions=keys=>keys.map(value=>({value,label:statuses[value]}));
export function notify(message) {
  const toast=document.querySelector('#toast');toast.textContent=message;toast.classList.add('show');
  clearTimeout(notify.timeout);notify.timeout=setTimeout(()=>toast.classList.remove('show'),4200);
}
export function downloadCsv(name, rows) {
  if(!rows.length) return notify('Não há registros para exportar.');
  const columns=Object.keys(rows[0]);
  const quote=v=>'"'+String(v??'').replace(/^[=+@\t\r]/,"'$&").replaceAll('"','""')+'"';
  const content='\uFEFF'+[columns,...rows.map(r=>columns.map(k=>r[k]))].map(row=>row.map(quote).join(';')).join('\r\n');
  const link=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
  link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
