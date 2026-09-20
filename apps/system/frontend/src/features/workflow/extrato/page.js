import { openExtratoImport } from './spreadsheet.js';
import { renderAccountFilter } from './account-filter.js';
import { renderListing, listingState } from '../../../components/tables/listing.js';
import { confirmDestructiveAction } from '../../../components/modals/confirmation-modal.js';
import { loadExtrato, saveExtrato, deleteExtrato, exportExtratoSpreadsheet } from './api.js';
import { esc, money, date, statuses, statusOptions, notify } from '../../../utils/presentation.js';
import { traceTransfer } from '../rastreio/detalhes.js';

export function renderExtrato(ctx) {
  const today=new Date().toLocaleDateString('sv-SE');
  const state=ctx.pageState.listing??=listingState({status:'pending',data:today,entidade_id:'',natureza_id:'',historico:'',valor_reais:'',conta_id:''});
  state.size=25;
  renderAccountFilter(ctx,state);
  const rows=ctx.data.extrato.map(r=>({...r,valor_reais:r.valor_reais??(r.valor/100).toFixed(2)}));
  const opts=kind=>[{value:'',label:kind==='contas'?'Selecione uma conta':'Sem classificação'},...ctx.data[kind].map(r=>({value:r.id,label:r.nome+(r.status==='inactive'?' (inativo)':'')}))];
  const fields=[
    {key:'status',minWidth:110,width:110,label:'Status',type:'select',required:true,options:statusOptions(['pending','reconciled','reversal']),filterEmpty:false,render:r=>`<span class="status-pill ${r.status}">${statuses[r.status]}</span>`},
    {key:'data',minWidth:130,width:130,label:'Data',type:'date',required:true,display:r=>date(r.data)},
    {key:'entidade_id',minWidth:150,width:150,label:'Entidade',type:'select',options:opts('entidades'),display:r=>r.entidade||'—'},
    {key:'natureza_id',minWidth:160,width:160,label:'Natureza',type:'select',options:opts('naturezas'),display:r=>r.natureza||'—'},
    {key:'historico',minWidth:280,label:'Histórico',type:'textarea',required:true,max:4000,render:r=>`<span class="cell-main" title="${esc(r.historico)}">${esc(r.historico)}</span>${r.rastreio_id?`<button type="button" class="text-link" data-transfer-trace="${r.rastreio_id}">Ver rastreio · ${esc(r.rastreio_codigo||r.rastreio_id)}</button>`:`<span class="cell-sub">Extrato #${r.id}${r.rastreio_condicao==='legado_sem_rastreio'?' · Legado sem rastreio':''}</span>`}`},
    {key:'valor_reais',minWidth:145,width:145,label:'Valor (R$)',type:'number',format:'money',precision:4,min:-90000000000,required:true,render:r=>`<span class="${Number(r.valor_reais)>0?'finance-credit':'finance-debit'}">${money(r.valor,r.valor_subcentavos)}</span>`},
    {key:'conta_id',minWidth:170,width:170,label:'Conta',type:'select',required:true,options:opts('contas'),filterOptions:ctx.data.contas_filtro.map(account=>({value:account.id,label:account.nome})),filterEmpty:false,display:r=>r.conta||'—'}
  ];
  renderListing(ctx,{state,rows,fields,kind:'extrato',onSave:saveExtrato,onImport:()=>openExtratoImport(ctx,state),onExport:exportExtratoSpreadsheet,quickFocusField:'historico',
    duplicate:r=>({...r,status:'pending',rastreio_id:null}),
    onDelete:async id=>{
      if(!await confirmDestructiveAction({title:'Excluir movimentação?',message:`Excluir o extrato #${id}?`,warning:rows.find(row=>row.id===id)?.rastreio_id?'O rastreio e seus itens também serão excluídos. A base Qprof será preservada.':'Essa ação não pode ser desfeita.'}))return;
      try{await deleteExtrato(id);state.selected.delete(String(id));await ctx.refresh();notify('Movimentação excluída.');}catch(e){notify(e.message);}
    }});
  const table=ctx.root.querySelector('.standard-data-table');
  table.classList.add('extrato-table');table.dataset.scrollMode='page';
  ctx.root.querySelectorAll('[data-transfer-trace]').forEach(b=>b.onclick=()=>traceTransfer(Number(b.dataset.transferTrace)).catch(error=>notify(error.message)));
}

export default {load:loadExtrato,render:renderExtrato};
