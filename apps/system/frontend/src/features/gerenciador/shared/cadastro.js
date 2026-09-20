import { renderListing, listingState } from '../../../components/tables/listing.js';
import { confirmDestructiveAction } from '../../../components/modals/confirmation-modal.js';
import { api } from '../../../services/api.js';
import { esc, statuses, statusOptions, functions, notify } from '../../../utils/presentation.js';

export function renderCadastro(ctx,{kind,toolbarActions=[],onAction}) {
  const field=kind==='contas'?'funcao':'classificacao';
  const state=ctx.pageState.listing??=listingState({nome:'',classificacao:'',funcao:'operacional',status:'active'});
  const fields=[
    {key:'nome',label:'Nome',type:'text',required:true,max:160,render:r=>`<strong>${esc(r.nome)}</strong><span class="cell-sub">#${r.id}</span>`},
    {key:field,label:kind==='contas'?'Função':'Classificação',type:kind==='contas'?'select':'text',required:kind==='contas',max:120,options:Object.entries(functions).map(([value,label])=>({value,label})),display:r=>kind==='contas'?functions[r.funcao]:r.classificacao},
    {key:'status',label:'Status',type:'select',required:true,options:statusOptions(['active','inactive']),filterEmpty:false,render:r=>`<span class="status-pill ${r.status}">${statuses[r.status]}</span>`}
  ];
  renderListing(ctx,{state,kind,rows:ctx.data[kind],fields,
    onSave:items=>api(`/gerenciador/${kind}/batch`,{method:'PUT',body:{items}}),duplicate:r=>({...r,nome:`${r.nome} (cópia)`}),
    toolbarActions,onAction,
    onDelete:async id=>{
      const r=ctx.data[kind].find(r=>r.id===id);
      if(!await confirmDestructiveAction({message:`Excluir “${r.nome}”? Cadastros em uso serão preservados.`}))return;
      try{await api(`/gerenciador/${kind}/${id}`,{method:'DELETE'});state.selected.delete(String(id));await ctx.refresh();notify('Cadastro excluído.');}catch(e){notify(e.message);}
    }
  });
}
