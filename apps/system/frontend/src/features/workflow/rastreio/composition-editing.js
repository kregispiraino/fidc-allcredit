import { renderEditableValue, renderEditableSelect, inlineRecordValues } from '../../../components/tables/standard-data-table.js';
import { esc, money } from '../../../utils/presentation.js';
import { itemTypes } from './item-form.js';

export const validCompositionItem=item=>!item._invalid&&(item.origem_posicao&&item.valor===null||Number.isSafeInteger(item.valor)&&(item.valor!==0||!!item.origem_posicao))&&Math.abs(item.valor)<=9000000000000&&(!['titulo','parcial'].includes(item.tipo)||!!item.titulo.trim());
export function itemEditor(item,key) {
  const labels={tipo:'Tipo',titulo:'Título',cedente:'Cedente',sacado:'Sacado',valor_reais:'Valor (R$)'};
  const value=key==='valor_reais'?(item._valueInput??(item.valor===null?'':(item.valor/100).toFixed(2))):item[key];
  let html=key==='tipo'?renderEditableSelect(value,item._key,key,itemTypes,true).replace('<select ','<select data-select-search ')
    :renderEditableValue(value,item._key,key,true,{type:key==='valor_reais'?'number':'text',format:key==='valor_reais'?'money':''});
  return html.replace('min="0"','').replace(/<(input|select) /,`<$1 aria-label="${esc(labels[key])}" ${key==='valor_reais'?(item.origem_posicao?'':'required '):'maxlength="160" '}`);
}
export function bindCompositionEditing(ctx,{canEdit,work,draft,selected,review,stale,allowDifference=false}) {
  const panel=ctx.root.querySelector('.composition-panel');
  const refresh=()=>{
    const total=draft.itens.reduce((sum,item)=>sum+(item.efeito==='compensacao'?0:item.valor),0),difference=Math.abs(selected?.valor||0)-total;
    panel.querySelector('[data-composition-total]').textContent=money(total);
    const delta=panel.querySelector('[data-composition-difference]');delta.textContent=money(difference);delta.className=difference===0?'ok':'warn';
    panel.querySelector('[data-confirm-transfer]').disabled=!selected||stale||!draft.itens.every(validCompositionItem)||(review?!draft.dirty:!draft.itens.length)||(!allowDifference&&difference!==0&&!(review&&!draft.itens.length));
    panel.querySelector('[data-composition-pdf]').disabled=true;
    panel.querySelector('[data-composition-status]').textContent='Alterações ainda não salvas.';
    panel.querySelector('[data-composition-cancel]').hidden=false;
  };
  const update=event=>{
    if(!canEdit)return;
    // Native field events are also emitted by the standard money/select controls.
    const source=event.target.closest('[data-inline-field]')||event.target.closest('.standard-number-field')?.querySelector('[data-inline-field]');if(!source)return;
    const item=draft.itens.find(row=>row._key===source.dataset.recordId);if(!item)return;
    const values=inlineRecordValues(panel,item._key),value=Number(values.valor_reais),cents=item.origem_posicao&&values.valor_reais===''?null:Math.round(value*100);
    Object.assign(item,{tipo:values.tipo,titulo:values.titulo,cedente:values.cedente,sacado:values.sacado,
      valor:cents===null?null:Number.isSafeInteger(cents)?cents:0,_valueInput:values.valor_reais});
    item._invalid=[...panel.querySelectorAll(`[data-record-id="${item._key}"]`)].some(input=>!input.validity.valid);
    draft.dirty=true;refresh();
  };
  panel.addEventListener('input',update);panel.addEventListener('change',update);
  panel.querySelector('[data-items-edit]').onclick=()=>{
    if(!canEdit||work.titleTab!=='vinculados')return;
    if(work.editing)cancelCompositionEdit(work,draft);
    else {
      draft.editSnapshot=structuredClone({itens:draft.itens,dirty:draft.dirty});
      work.editing=true;
    }
    ctx.render();
  };
  panel.querySelector('[data-items-save]').onclick=()=>{
    if(!canEdit||work.titleTab!=='vinculados')return;
    const invalid=[...panel.querySelectorAll('[data-inline-field]')].find(input=>!input.checkValidity());
    if(invalid){invalid.reportValidity();return;}
    if(!draft.itens.every(validCompositionItem)){ctx.notify('Revise os valores e informe o título nos itens do tipo Título ou Parcial.');return;}
    delete draft.editSnapshot;work.editing=false;ctx.render();
  };
}
export function cancelCompositionEdit(work,draft) {
  if(!work.editing)return;
  if(draft.editSnapshot)Object.assign(draft,draft.editSnapshot);
  delete draft.editSnapshot;work.editing=false;
}
