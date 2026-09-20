import { renderImportSources } from '../shared/cards.js';
import { defaultImportPeriod } from '../shared/period.js';
import { loadExtratos, fileContent, importExtrato } from './api.js';
import { functions } from '../../../utils/presentation.js';
function render(ctx) {
  const states=ctx.pageState.sources??={};
  const sources=ctx.data.fontes.map(source=>{
    const state=states[source.chave]??={period:defaultImportPeriod(),file:null,busy:false,error:null,result:null};
    return {key:source.chave,title:source.nome||`${source.banco==='bradesco'?'Bradesco':'Singulare'} ${source.numero}`,
      description:`${source.agencia?`Agência ${source.agencia} · `:''}${functions[source.funcao]||'Conta não vinculada'}`,disabled:!source.conta_id||source.status!=='active'||source.funcao==='neutra',
      accept:source.banco==='bradesco'?'.xls':'.csv',lastImport:source.ultima_importacao,...state};
  });
  renderImportSources(ctx,sources);
  if(ctx.canWrite===false)return;
  for(const source of sources){
    const card=ctx.root.querySelector(`[data-import-source="${source.key}"]`),state=states[source.key],input=card.querySelector('[type=file]'),drop=card.querySelector('.dropzone');
    if(!input)continue;
    const select=files=>{
      if(state.busy)return;state.result=null;state.error=null;state.file=null;
      const file=files[0];
      if(files.length!==1)state.error='Selecione apenas um arquivo por conta.';
      else if(!file.name.toLowerCase().endsWith(source.accept)||!file.size||file.size>8*1024*1024)state.error=`Envie um arquivo ${source.accept.toUpperCase()} de até 8 MB.`;
      else state.file=file;
      ctx.render();
    };
    input.onchange=()=>select(input.files);
    card.querySelector('[data-import-select]').onclick=()=>input.click();
    drop.onclick=()=>{if(!state.busy)input.click();};
    drop.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();if(!state.busy)input.click();}};
    card.ondragover=event=>{event.preventDefault();if(!state.busy)drop.classList.add('dragging');};
    card.ondragleave=event=>{if(!card.contains(event.relatedTarget))drop.classList.remove('dragging');};
    card.ondrop=event=>{event.preventDefault();drop.classList.remove('dragging');select(event.dataTransfer.files);};
    card.querySelector('[data-import-clear]')?.addEventListener('click',()=>{state.file=null;state.error=null;state.result=null;ctx.render();});
    const start=card.querySelector('[data-import-start]'),end=card.querySelector('[data-import-end]');
    for(const [field,key] of [[start,'start'],[end,'end']])field.oninput=field.onchange=()=>{state.period[key]=field.value;};
    card.querySelector('[data-import-submit]').onclick=async()=>{
      if(state.busy||!state.file)return;
      if(!start.checkValidity()||!end.checkValidity()||!state.period.start||!state.period.end||state.period.start>state.period.end){state.error='Informe um período válido: início anterior ou igual ao fim.';ctx.render();return;}
      const {file,period}=state;state.busy=true;state.error=null;state.result=null;ctx.render();
      try{
        state.result=await importExtrato(source.key,{filename:file.name,content:await fileContent(file),...period});
        state.file=null;await ctx.refresh();
      }catch(error){state.error=error.message;}
      finally{state.busy=false;ctx.render();}
    };
  }
  ctx.beforeLeave=async()=>{
    if(Object.values(states).some(state=>state.busy)){ctx.notify('Aguarde a importação terminar antes de sair.');return false;}return true;
  };
  ctx.hasUnsaved=()=>Object.values(states).some(state=>state.busy);
}
export default {load:loadExtratos,render};
