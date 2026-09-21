import { pendingSelected, togglePending } from './pending-selection.js';
import { selectQprof } from '../../importacao/qprof/api.js';
import { sourceItem } from './composition-state.js';
import { notify } from '../../../utils/presentation.js';
const queryKey=search=>JSON.stringify({q:search?.query.q,filters:search?.query.filters,versao:search?.versao});
export function compositionSelection(work,draft,rows,search){
  if(work.titleTab==='pendencias'){const count=rows.filter(row=>pendingSelected(draft,row)).length;return {checked:rows.length>0&&count===rows.length,mixed:count>0&&count<rows.length,disabled:!rows.length,label:'Selecionar todas as pendências filtradas',title:'Todos os resultados do filtro, incluindo as outras páginas'};}
  if(!search)return {checked:rows.length>0,mixed:false,disabled:!rows.length||work.editing,label:'Desvincular todos os itens filtrados',title:'Desvincular os itens deste filtro, em todas as páginas'};
  const ids=work.selectionResult?.key===queryKey(search)?work.selectionResult.ids:search.total===rows.length?rows.map(row=>row._source):[];
  const selected=new Set(draft.itens.map(item=>item.qprof_titulo_id));
  const checked=ids.length>0&&ids.every(id=>selected.has(id));
  return {checked,mixed:!checked&&rows.some(row=>selected.has(row._source)),disabled:search.loading||search.error||!search.total||work.selecting,
    label:checked?'Desvincular todos os títulos filtrados':'Selecionar todos os títulos filtrados',title:'Todos os resultados do filtro, incluindo as outras páginas'};
}
export function bindCompositionSelection(ctx,{canEdit,review,work,draft,rows,search,selected}){
  const button=ctx.root.querySelector('[data-titles-select-all]');
  button.onclick=async()=>{
    if(!canEdit||!selected||button.disabled)return;
    if(work.titleTab==='pendencias'){const remove=rows.every(row=>pendingSelected(draft,row));if(!remove&&draft.itens.length+rows.filter(row=>!pendingSelected(draft,row)).length>2000){notify('A composição aceita até 2.000 itens.');return;}togglePending(draft,rows,remove);ctx.render();return;}
    if(!search){const keys=new Set(rows.map(row=>row._key));draft.itens=draft.itens.filter(item=>!keys.has(item._key));draft.dirty=true;ctx.render();return;}
    const key=queryKey(search),entryId=selected.id,tab=ctx.state.tab,unselect=button.getAttribute('aria-checked')==='true';
    const active=()=>ctx.state.section==='workflow'&&ctx.state.page==='rastreio'&&ctx.state.tab===tab;
    work.selecting=true;ctx.root.querySelectorAll('[data-titles-select-all],[data-title]').forEach(control=>control.disabled=true);
    try{
      const result=await selectQprof({...search.query,versao:search.versao});
      if((review&&!draft.reviewEditing)||work.drafts[entryId]!==draft||!active()||work.selected!==entryId||work.titleTab!=='todos'||queryKey(work.search)!==key)return;
      const ids=new Set(result.items.map(item=>item.id));
      const existing=new Set(draft.itens.map(item=>item.qprof_titulo_id));
      if(unselect)draft.itens=draft.itens.filter(item=>!ids.has(item.qprof_titulo_id));
      else{
        const added=result.items.filter(item=>!existing.has(item.id));
        if(draft.itens.length+added.length>2000)throw new Error('A composição aceita até 2.000 itens. Refine a seleção.');
        draft.itens.push(...added.map(sourceItem));
      }
      work.selectionResult={key,ids:[...ids]};draft.dirty=true;
    }catch(error){notify(error.message);}
    finally{work.selecting=false;if(active())ctx.render();}
  };
}
