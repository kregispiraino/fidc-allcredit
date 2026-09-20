import { openForm, selectField } from '../../../components/modals/form-modal.js';
import { esc } from '../../../utils/presentation.js';
export const itemTypes=[{value:'titulo',label:'Título'},{value:'parcial',label:'Parcial'},{value:'tarifa',label:'Tarifa'},{value:'custas',label:'Custas'},{value:'ajuste',label:'Ajuste'}];
export const itemLabel=type=>itemTypes.find(item=>item.value===type)?.label||type;
export function editCompositionItem(item,onSave) {
  const row=item||{tipo:'custas',titulo:'',cedente:'',sacado:'',valor:''};
  const text=(name,label)=>`<label class="form-field"><span>${label}</span><input name="${name}" aria-label="${label}" maxlength="160" value="${esc(row[name]||'')}"></label>`;
  const dialog=openForm({title:item?'Editar item da composição':'Criar registro na composição',description:'Este registro pertence somente à composição. Não cria movimentação no Extrato nem título na base Qprof.',submitLabel:item?'Aplicar alteração':'Adicionar registro',
    content:`<div class="form-grid">${selectField('tipo','Tipo',itemTypes,row.tipo)}${text('titulo','Título')}${text('cedente','Cedente')}${text('sacado','Sacado')}<label class="form-field"><span>Valor (R$)</span><input name="valor_reais" aria-label="Valor (R$)" type="number" step="0.01" data-input-format="money" ${row.origem_posicao?'':'required'} value="${row.valor===''||row.valor===null?'':(row.valor/100).toFixed(2)}"></label></div>`,
    onSubmit:async form=>{
      const values=Object.fromEntries(form),valor=row.origem_posicao&&values.valor_reais===''?null:Math.round(Number(values.valor_reais)*100);
      if(!(row.origem_posicao&&valor===null)&&(!Number.isSafeInteger(valor)||(valor===0&&!row.origem_posicao)))throw new Error('Informe um valor diferente de zero.');
      if(['titulo','parcial'].includes(values.tipo)&&!values.titulo.trim())throw new Error('Informe o título para este tipo de registro.');
      onSave({...item,...values,valor,_invalid:false,_valueInput:undefined,_key:item?._key||crypto.randomUUID()});
    }});
  return dialog;
}
