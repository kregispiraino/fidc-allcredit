export function parseDateText(value) {
  const text=String(value).trim();
  if(!text)return '';
  const parts=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  const iso=parts?`${parts[3]}-${parts[2]}-${parts[1]}`:text;
  const date=new Date(`${iso}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso)&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso?iso:null;
}
const display=value=>value?value.split('-').reverse().join('/'):'';

// Keep the native date as the form/API value and calendar. Text can be selected,
// copied and pasted as a whole, without changing every consumer of date fields.
export function enhanceDateInput(source,label){
  const doc=source.ownerDocument,win=doc.defaultView;
  const wrapper=doc.createElement('span');wrapper.className='standard-date-field';
  source.before(wrapper);wrapper.append(source);
  const proxy=doc.createElement('input');proxy.type='text';proxy.inputMode='numeric';
  proxy.dataset.inputProxy='';proxy.dataset.dateProxy='';proxy.className=source.className;
  proxy.placeholder='dd/mm/aaaa';proxy.autocomplete='off';proxy.setAttribute('aria-label',label);
  const button=doc.createElement('button');button.type='button';button.className='standard-date-picker';
  button.setAttribute('aria-label',`Abrir calendário: ${label}`);
  button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v15H5zM8 3v4m8-4v4M5 10h14"/></svg>';
  wrapper.append(proxy,button);
  source.classList.add('standard-input-native');source.tabIndex=-1;source.setAttribute('aria-hidden','true');
  const sync=()=>{
    proxy.disabled=source.disabled;proxy.readOnly=source.readOnly;
    button.disabled=source.disabled||source.readOnly;
    if(doc.activeElement!==proxy)proxy.value=display(source.value);
  };
  const emit=type=>source.dispatchEvent(new win.Event(type,{bubbles:true}));
  proxy.addEventListener('dblclick',()=>proxy.select());
  proxy.addEventListener('input',()=>{
    const value=parseDateText(proxy.value);
    const error=value===null?'Informe uma data válida no formato dd/mm/aaaa.':'';
    source.setCustomValidity(error);proxy.setCustomValidity(error);
    if(value!==null){source.value=value;emit('input');}
  });
  proxy.addEventListener('change',()=>{if(source.validity.valid)emit('change');});
  proxy.addEventListener('blur',()=>{if(source.validity.valid)sync();});
  button.onclick=()=>{
    if(button.disabled)return;
    if(source.showPicker)source.showPicker();else source.focus();
  };
  source.addEventListener('input',()=>{if(doc.activeElement!==proxy){proxy.setCustomValidity('');source.setCustomValidity('');sync();}});
  source.addEventListener('change',()=>{if(doc.activeElement!==proxy){proxy.setCustomValidity('');source.setCustomValidity('');sync();}});
  source.addEventListener('focus',()=>proxy.focus({preventScroll:true}));
  source.addEventListener('invalid',event=>{event.preventDefault();proxy.focus();proxy.setCustomValidity(source.validationMessage);proxy.reportValidity();});
  sync();
  return {sync};
}
