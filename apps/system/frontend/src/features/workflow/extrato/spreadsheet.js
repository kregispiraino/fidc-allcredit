import { openForm } from '../../../components/modals/form-modal.js';
import { fileContent } from '../../importacao/shared/file.js';
import { previewExtratoImport, importExtratoSpreadsheet } from './api.js';
import { notify } from '../../../utils/presentation.js';
export function openExtratoImport(ctx,state){
  let upload=null,preview=null,busy=false;
  const dialog=openForm({title:'Importar alterações do Extrato',description:'Selecione a planilha exportada desta tabela. Os registros serão atualizados pelo ID, sem criar ou excluir movimentações.',submitLabel:'Importar alterações',
    content:'<label class="form-field"><span>Planilha Excel ou CSV</span><input type="file" data-extrato-file accept=".xlsx,.xls,.csv" required aria-label="Planilha do Extrato"></label><p>Edite Status, Data, Entidade, Natureza, Histórico, Valor e Conta. Mantenha os IDs e use os nomes cadastrados de entidades, naturezas e contas.</p><button type="button" class="form-action secondary" data-extrato-preview disabled>Conferir arquivo</button><p data-extrato-preview-result role="status"></p>',
    onSubmit:async()=>{
      if(busy||!upload||!preview)throw new Error('Confira o arquivo antes de importar.');
      busy=true;dialog.querySelector('[data-extrato-file]').disabled=true;
      try{const result=await importExtratoSpreadsheet({...upload,revisoes:preview.revisoes});state.selected.clear();await ctx.refresh();notify(`${result.atualizados} registros atualizados · ${result.sem_alteracao} sem alteração.`);}
      finally{busy=false;dialog.querySelector('[data-extrato-file]').disabled=false;}
    }});
  const input=dialog.querySelector('[data-extrato-file]'),check=dialog.querySelector('[data-extrato-preview]'),submit=dialog.querySelector('[type=submit]'),result=dialog.querySelector('[data-extrato-preview-result]'),error=dialog.querySelector('.form-error');
  submit.disabled=true;
  input.onchange=()=>{upload=null;preview=null;submit.disabled=true;check.disabled=!input.files.length;error.hidden=true;result.textContent='';};
  check.onclick=async()=>{
    if(busy||!input.files[0])return;
    busy=true;check.disabled=true;submit.disabled=true;input.disabled=true;error.hidden=true;result.textContent='Conferindo arquivo…';
    try{
      const file=input.files[0];if(!file.size||file.size>8*1024*1024)throw new Error('Selecione um arquivo de até 8 MB.');
      upload={filename:file.name,content:await fileContent(file)};preview=await previewExtratoImport(upload);
      result.textContent=`${preview.total} registros conferidos · ${preview.atualizar} para atualizar · ${preview.sem_alteracao} sem alteração.`;submit.disabled=false;
    }catch(e){preview=null;result.textContent='';error.textContent=e.message;error.hidden=false;}
    finally{busy=false;input.disabled=false;check.disabled=false;}
  };
  const beforeLeave=ctx.beforeLeave,hasUnsaved=ctx.hasUnsaved;
  ctx.beforeLeave=async()=>{if(dialog.open){notify('Conclua ou feche a importação antes de sair.');return false;}return beforeLeave?.()??true;};
  ctx.hasUnsaved=()=>busy||!!upload||hasUnsaved?.();
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',event=>{if(busy){event.preventDefault();event.stopImmediatePropagation();}},true));
  dialog.addEventListener('close',()=>{ctx.beforeLeave=beforeLeave;ctx.hasUnsaved=hasUnsaved;},{once:true});
}
