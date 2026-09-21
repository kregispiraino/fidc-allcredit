import { pendingSelected, togglePending, matchingTransfers } from './pending-selection.js';
import { associateMovement } from './associacao.js';
import { showControlRecord } from './pendencias.js';
import { compositionSelection, bindCompositionSelection } from './composition-selection.js';
import { titleSearch } from './title-search.js';
import { bindTableFilter, filterTableRows } from '../../../components/tables/table-filter.js';
import { confirmDestructiveAction } from '../../../components/modals/confirmation-modal.js';
import { confirmRastreio, updateRastreio, downloadCompositionPdf } from './api.js';
import { money, normalize, notify } from '../../../utils/presentation.js';
import { compositionState, draftFor, sourceItem, itemPayload, switchTitleTab } from './composition-state.js';
import { editCompositionItem, itemTypes } from './item-form.js';
import { bindCompositionEditing, cancelCompositionEdit, validCompositionItem } from './composition-editing.js';
import { compositionView } from './composition-view.js';

export function renderComposition(ctx) {
  const {tab,review,work,entries,transfers,accounts}=compositionState(ctx);
  const pendingFields=[{key:'historico',label:'Histórico',type:'text'},{key:'data',label:'Data',type:'date'},{key:'valor',label:'Valor',type:'number',format:'money',filterValue:row=>Math.abs(row.valor)/100}];
  const matches=review&&work.transferQuery?.trim()?matchingTransfers(ctx.data.itens,work.transferQuery):null;
  const pending=filterTableRows(entries,pendingFields,review?{}:work.pendingFilters).filter(entry=>!matches||matches.has(transfers.get(entry.id)?.id));
  const selected=pending.find(entry=>entry.id===work.selected)||pending[0];work.selected=selected?.id??null;
  const transfer=transfers.get(selected?.id),draft=draftFor(ctx,work,selected,transfer);
  const total=draft.itens.reduce((sum,item)=>sum+(item.efeito==='compensacao'?0:item.valor),0),difference=selected?Math.abs(selected.valor)-total:0;
  const updating=!!transfer,allowDifference=!!transfer?.origem_chave;
  const stale=updating&&draft.dirty&&draft.versao!==transfer?.versao;
  const canEdit=ctx.canWrite!==false&&(!review||!!draft.reviewEditing);
  const accountName=ctx.data.contas.find(account=>account.id===(selected?.conta_id??accounts[0]))?.nome||'—';
  const portfolioOptions=key=>[...new Set([...(ctx.data.filtros_qprof?.[key]||[]),...(work.titleTab==='vinculados'?draft.itens.map(item=>item[key]):[])].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(value=>({value,label:value}));
  const fields=[...(work.titleTab==='vinculados'?[{key:'tipo',label:'Tipo',type:'select',options:itemTypes,filterEmpty:false}]:[]),{key:'titulo',label:'Título',type:'text'},
    {key:'cedente',label:'Cedente',type:'text'},{key:'sacado',label:'Sacado',type:'text'},
    {key:'valor',label:'Valor (R$)',type:'number',filterValue:row=>row.valor/100},{key:'data_liquidacao',label:'Data de liquidação',type:'date'},
    {key:'carteira',label:'Carteira',type:'select',options:portfolioOptions('carteira')},{key:'carteira_interna',label:'Carteira interna',type:'select',options:portfolioOptions('carteira_interna')}];
  const search=work.titleTab==='todos'?titleSearch(ctx,work):null;
  const sourceRows=(search?.items||[]).map(source=>({...source,_source:source.id,tipo:'titulo',titulo:source.numero}));
  const pendingRows=(ctx.data.registros||[]).filter(row=>row.aguarda_saida).map(row=>({...row,_pending:row.id,registro_id:row.id,valor:row.saldo_calculado}));
  const rows=search?sourceRows:filterTableRows(work.titleTab==='pendencias'?pendingRows:draft.itens,fields,work.filters).filter(row=>normalize(`${row.titulo} ${row.cedente} ${row.sacado} ${row.valor/100} ${money(row.valor)}`).includes(normalize(work.query)));
  const pages=search?.pages??Math.max(1,Math.ceil(rows.length/15));if(!search)work.page=Math.min(work.page,pages);
  const old=ctx.root.querySelector('.rastreio-shell');
  const scroll=old?.dataset.compositionView===tab?{list:old.querySelector('.transfer-list').scrollTop,
    top:old.dataset.currentEntry===String(selected?.id)?old.querySelector('.title-table-wrap').scrollTop:0,
    left:old.querySelector('.title-table-wrap').scrollLeft}:null;
  ctx.root.innerHTML=compositionView({updating,allowDifference,canEdit,review,tab,work,pending,selected,transfer,draft,total,difference,visible:search?rows:rows.slice((work.page-1)*15,work.page*15),pages,stale,search,selection:compositionSelection(work,draft,rows,search)});
  if(scroll){ctx.root.querySelector('.transfer-list').scrollTop=scroll.list;const table=ctx.root.querySelector('.title-table-wrap');table.scrollTop=scroll.top;table.scrollLeft=scroll.left;}
  if(ctx.canWrite===false)ctx.root.querySelectorAll('[data-confirm-transfer],[data-associate-movement]').forEach(button=>{button.disabled=true;button.hidden=true;});
  bindCompositionSelection(ctx,{canEdit,review,work,draft,rows,search,selected});
  bindCompositionEditing(ctx,{canEdit,work,draft,selected,review:updating,stale,allowDifference});
  ctx.root.querySelectorAll('[data-control-record]').forEach(button=>button.onclick=()=>showControlRecord(ctx,Number(button.dataset.controlRecord)));
  ctx.root.querySelector('[data-associate-movement]')?.addEventListener('click',()=>associateMovement(ctx,transfer));
  const changed=()=>{draft.dirty=true;ctx.render();};
  bindTableFilter({...ctx,root:ctx.root.querySelector('.rastreio-shell > .panel-card')},{fields:pendingFields,values:work.pendingFilters,onApply:values=>{cancelCompositionEdit(work,draft);work.pendingFilters=values;ctx.render();}});
  bindTableFilter({...ctx,root:ctx.root.querySelector('.composition-panel')},{fields,values:work.filters,onApply:values=>{work.filters=values;work.page=1;ctx.render();}});
  ctx.root.querySelectorAll('[data-transfer]').forEach(button=>button.onclick=()=>{cancelCompositionEdit(work,draft);if(!draft.dirty)draft.reviewEditing=false;work.selected=button.dataset.transfer.startsWith('tr-')?button.dataset.transfer:Number(button.dataset.transfer);work.editing=false;work.page=1;ctx.render();});
  ctx.root.querySelectorAll('[data-title-tab]').forEach(button=>button.onclick=()=>{cancelCompositionEdit(work,draft);switchTitleTab(work,button.dataset.titleTab);work.editing=false;ctx.render();});
  ctx.root.querySelector('#trackingTitleSearch')?.addEventListener('input',event=>{work.transferQuery=event.target.value;ctx.render();});
  ctx.root.querySelectorAll('[data-pending-title]').forEach(button=>button.onclick=()=>{
    if(!canEdit||!selected)return;
    const row=pendingRows.find(row=>row.id===Number(button.dataset.pendingTitle));
    if(!pendingSelected(draft,row)&&draft.itens.length>=2000){notify('A composição aceita até 2.000 itens.');return;}
    togglePending(draft,[row],!!pendingSelected(draft,row));ctx.render();
  });
  ctx.root.querySelectorAll('[data-title]').forEach(button=>button.onclick=()=>{
    if(!canEdit||!selected||work.selecting)return;
    const id=Number(button.dataset.title),linked=draft.itens.some(item=>item.qprof_titulo_id===id);
    if(linked)draft.itens=draft.itens.filter(item=>item.qprof_titulo_id!==id);
    else {if(draft.itens.length>=2000){notify('A composição aceita até 2.000 itens.');return;}draft.itens.push(sourceItem(search.items.find(source=>source.id===id)));}
    changed();
  });
  ctx.root.querySelector('[data-item-new]').onclick=()=>{
    if(!canEdit||!selected||work.titleTab!=='vinculados')return;
    editCompositionItem(null,item=>{
      draft.itens.push(item);delete draft.editSnapshot;work.editing=false;
      switchTitleTab(work,'vinculados');work.query='';work.filters={};work.page=Math.ceil(draft.itens.length/15);changed();
      const table=ctx.root.querySelector('.title-table-wrap');table.scrollTop=table.scrollHeight;
    });
  };
  ctx.root.querySelectorAll('[data-item-edit]').forEach(button=>button.onclick=()=>{
    if(!canEdit)return;
    const index=draft.itens.findIndex(item=>item._key===button.dataset.itemEdit);
    editCompositionItem(draft.itens[index],item=>{draft.itens[index]=item;changed();});
  });
  ctx.root.querySelectorAll('[data-item-remove]').forEach(button=>button.onclick=()=>{if(!canEdit)return;draft.itens=draft.itens.filter(item=>item._key!==button.dataset.itemRemove);changed();});
  ctx.root.querySelector('[data-composition-cancel]')?.addEventListener('click',async()=>{
    if(draft.dirty&&!await confirmDestructiveAction({title:'Descartar alterações?',message:'A composição salva será mantida.',actionLabel:'Descartar',warning:'As alterações locais serão descartadas.'}))return;
    delete work.drafts[selected.id];work.editing=false;ctx.render();
  });
  ctx.root.querySelector('#titleSearch').oninput=event=>{work.query=event.target.value;work.page=1;ctx.render();};
  ctx.root.querySelector('[data-title-retry]')?.addEventListener('click',()=>{work.search=null;ctx.render();});
  ctx.root.querySelector('[data-title-prev]').onclick=()=>{work.page--;ctx.render();};
  ctx.root.querySelector('[data-title-next]').onclick=()=>{work.page++;ctx.render();};
  ctx.root.querySelector('[data-composition-pdf]').onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{await downloadCompositionPdf(transfer.id,transfer.codigo);}catch(error){notify(error.message);}finally{if(button.isConnected)button.disabled=false;}
  };
  ctx.root.querySelector('[data-confirm-transfer]').onclick=async event=>{
    if(!selected||ctx.canWrite===false)return;
    if(review&&!canEdit){draft.reviewEditing=true;ctx.render();return;}
    const invalid=[...ctx.root.querySelectorAll('[data-inline-field]')].find(input=>!input.checkValidity());
    if(invalid){invalid.reportValidity();return;}
    if(!draft.itens.every(validCompositionItem)){notify('Revise os valores e títulos da composição.');return;}
    const total=draft.itens.reduce((sum,item)=>sum+(item.efeito==='compensacao'?0:item.valor),0);
    const button=event.currentTarget,empty=updating&&!draft.itens.length;
    if(!await confirmDestructiveAction({title:empty?'Remover rastreio?':updating?'Salvar composição?':tab==='conciliacao'?'Confirmar conciliação?':'Confirmar liquidação?',
      message:`${draft.itens.length} itens · ${money(total)} · ${transfer?.codigo||`Extrato #${selected.id}`}`,actionLabel:empty?'Remover rastreio':updating?'Salvar composição':'Confirmar rastreio',
      warning:empty?(transfer.extrato_id?'A movimentação permanecerá no Extrato e voltará à fila de composição.':'A transferência e seus vínculos serão removidos. Os registros dos itens permanecerão no controle. Nenhuma movimentação será criada.'):'Somente os registros desta composição serão gravados.',tone:empty?'critical':'simple'}))return;
    button.disabled=true;
    try{
      const itens=draft.itens.map(itemPayload);
      if(updating)await updateRastreio(transfer.id,{versao:draft.versao,itens});
      else await confirmRastreio({extrato_id:selected.id,itens});
      delete work.drafts[selected.id];work.editing=false;if(!updating||empty)work.selected=null;
      await ctx.refresh();notify(empty?'Rastreio removido.':updating?'Composição atualizada.':'Rastreio confirmado.');
    }catch(error){notify(error.message);await ctx.refresh().catch(()=>{});}
  };
  return [[review?'Rastreios':'Pendentes',entries.length],['Valor total',money(entries.reduce((sum,entry)=>sum+Math.abs(entry.valor),0))],[review?'Contas':'Conta',review?'Todas':accountName]];
}
