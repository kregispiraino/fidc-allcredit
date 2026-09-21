import { renderImportSources } from '../shared/cards.js';
import { fileContent } from '../shared/file.js';
import { loadQprof, importQprof } from './api.js';
function render(ctx){
  const state=ctx.pageState.upload??={file:null,busy:false,error:null,result:null};
  renderImportSources(ctx,[{key:'qprof',title:'Títulos · Qprof',description:`${ctx.data.quantidade.toLocaleString('pt-BR')} títulos na base de consulta`,accept:'.csv,.xlsx,.xls',
    dropLabel:'Arraste a planilha de títulos aqui',submitLabel:'Atualizar títulos',lastImport:ctx.data.updated_at,
    helpText:'Atualizar títulos renova a base de consulta e reutiliza os títulos existentes. As composições salvas são preservadas.',
    ...state,resultSummary:state.result?`${state.result.quantidade.toLocaleString('pt-BR')} títulos na nova base`:'',resultDetail:'Base atualizada para consulta no Rastreio. As composições salvas foram preservadas.'}]);
  if(ctx.canWrite===false)return;
  const card=ctx.root.querySelector('[data-import-source]'),input=card.querySelector('[type=file]'),drop=card.querySelector('.dropzone');
  const select=files=>{
    if(state.busy||!files.length)return;
    state.file=null;state.error=null;state.result=null;
    if(files.length!==1)state.error='Selecione uma única planilha.';
    else if(!/\.(xlsx?|csv)$/i.test(files[0].name)||!files[0].size||files[0].size>25*1024*1024)state.error='Envie um arquivo .csv, .xlsx ou .xls de até 25 MB.';
    else state.file=files[0];
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
  card.querySelector('[data-import-submit]').onclick=async()=>{
    if(state.busy||!state.file)return;
    const file=state.file,versao=ctx.data.versao;
    state.busy=true;state.error=null;state.result=null;ctx.render();
    try{state.result=await importQprof({filename:file.name,content:await fileContent(file),versao});state.file=null;await ctx.refresh();}
    catch(error){state.error=error.message;}
    finally{state.busy=false;ctx.render();}
  };
  ctx.hasUnsaved=()=>state.busy;
  ctx.beforeLeave=async()=>{if(state.busy){ctx.notify('Aguarde a atualização dos títulos terminar antes de sair.');return false;}return true;};
}
export default {load:loadQprof,render};
