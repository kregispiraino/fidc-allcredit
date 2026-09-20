import { esc } from '../../utils/presentation.js';
export function openForm({title,description='',content,submitLabel='Salvar',onSubmit,wide=false,readOnly=false}) {
  const previous=document.activeElement;
  const dialog=document.createElement('dialog');dialog.className=`standard-dialog ${wide?'dialog-wide':''}`;
  dialog.innerHTML=`<form><header class="dialog-header"><div><h2>${esc(title)}</h2><p>${esc(description)}</p></div><button type="button" class="row-icon-action" data-close aria-label="Fechar">×</button></header><div class="dialog-body">${content}<p class="form-error" role="alert" hidden></p></div><footer class="dialog-footer"><span>${readOnly?'Consulta de rastreabilidade':'As alterações serão salvas ao confirmar.'}</span><div class="form-footer-right"><button type="button" class="form-action secondary" data-close>${readOnly?'Fechar':'Cancelar'}</button>${readOnly?'':`<button class="form-action primary" type="submit">${esc(submitLabel)}</button>`}</div></footer></form>`;
  document.body.append(dialog);dialog.showModal();
  let busy=false;
  const close=()=>{if(!busy)dialog.close();};
  dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  dialog.addEventListener('close',()=>{dialog.remove();if(previous?.isConnected)previous.focus();},{once:true});
  dialog.querySelector('form').onsubmit=async e=>{
    e.preventDefault();if(busy || readOnly)return;busy=true;
    const buttons=[...dialog.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
    const error=dialog.querySelector('.form-error');error.hidden=true;
    try{await onSubmit(new FormData(e.currentTarget),dialog);busy=false;dialog.close();}
    catch(err){error.textContent=err.message;error.hidden=false;}
    finally{busy=false;buttons.forEach(b=>b.disabled=false);}
  };
  return dialog;
}
export function selectField(name,label,options,value='',extra='') {
  return `<label class="form-field"><span>${esc(label)}</span><select name="${esc(name)}" data-select-search ${extra}>${options.map(o=>`<option value="${esc(o.value)}" ${String(o.value)===String(value)?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`;
}
