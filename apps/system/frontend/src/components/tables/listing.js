import { renderStandardDataTable, renderRowActions, bindStandardDataTable, renderEditableValue, renderEditableSelect, inlineRecordValues, prepareQuickRegistrationRow, updateTableSelection } from './standard-data-table.js';
import { createQuickRegistrationDrafts } from './quick-registration.js';
import { isRowEditing, selectedRecordPage, toggleTableSelection } from './table-selection.js';
import { requestBatchEdit } from './table-batch-edit.js';
import { bindTableFilter, filterTableRows } from './table-filter.js';
import { confirmDestructiveAction } from '../modals/confirmation-modal.js';
import { esc, notify, downloadCsv } from '../../utils/presentation.js';

export function listingState(defaults={}) {
  return {page:1,size:15,selected:new Set(),filters:{},editing:false,drafts:createQuickRegistrationDrafts(defaults)};
}
const readOnly=(field,row)=>typeof field.readOnly==='function'?field.readOnly(row):!!field.readOnly;
function cell(field,row,editing) {
  if(!editing || readOnly(field,row))return field.render?field.render(row):esc(field.display?.(row)??row[field.key]??'—');
  let html=field.type==='select'
    ?renderEditableSelect(row[field.key],row.id,field.key,field.options,true).replace('<select ','<select data-select-search ')
    :renderEditableValue(row[field.key],row.id,field.key,true,{type:field.type||'text',format:field.format||'',precision:field.precision||2,placeholder:field.placeholder||''});
  html=html.replace(/<(input|select|textarea) /,`<$1 aria-label="${esc(field.label)}" ${field.required?'required ':''}`);
  if(field.type==='number')html=html.replace('min="0"',field.min===undefined?'':`min="${field.min}"`);
  if(field.max)html=html.replace(/<(input|textarea) /,`<$1 maxlength="${field.max}" `);
  return html;
}

// Askora lifecycle: inline editing, temporary quick rows and anchored batch edit.
export function renderListing(ctx,{state,rows,fields,kind,onSave,onDelete,deleteDisabled=()=>false,quickFocusField,toolbarActions=[],onAction,duplicate,exportRows=rows,exportRow=row=>row,showNew=true,showEdit=true,showDuplicate=true,onImport,onExport,rowActions}) {
  if(ctx.canWrite===false){showNew=false;showEdit=false;showDuplicate=false;onDelete=undefined;onImport=undefined;state.editing=false;state.drafts.clear();}
  const {root}=ctx,{drafts,selected}=state;
  const focusField=quickFocusField||fields.find(field=>!field.readOnly&&['text','textarea'].includes(field.type))?.key;
  const matching=filterTableRows(rows,fields,state.filters);
  const pages=Math.max(1,Math.ceil(matching.length/state.size));
  if(state.editing)state.page=selectedRecordPage(matching,selected,state.page,state.size);
  state.page=Math.min(state.page,pages);
  const visible=matching.slice((state.page-1)*state.size,state.page*state.size);
  const editing=state.editing||drafts.length>0;
  const reset=()=>{state.editing=false;drafts.clear();selected.clear();};
  ctx.beforeLeave=async()=>{
    if(!state.editing&&!drafts.length)return true;
    const leave=await confirmDestructiveAction({title:'Sair sem salvar?',message:'Há registros em edição nesta tabela.',actionLabel:'Descartar alterações',warning:'As alterações não salvas serão descartadas.'});
    if(leave)reset();return leave;
  };
  ctx.hasUnsaved=()=>state.editing||drafts.length>0;
  root.innerHTML=renderStandardDataTable({tabs:[],primaryLabel:'Cadastro rápido',showNew,showEdit,showDuplicate,showImport:!!onImport,
    editing,creating:drafts.length>0,selectedCount:selected.size,currentPage:state.page,totalPages:pages,toolbarActions,
    columns:fields.map(f=>f.label),emptyMessage:'Nenhum registro encontrado. Revise os filtros.',recordLabel:'Registros',
    rowsHtml:[...drafts.records,...visible].map(r=>{
      const draft=drafts.has(r.id),edit=draft||isRowEditing(state.editing,selected,r.id);
      return `<tr data-record-row="${r.id}" class="${selected.has(String(r.id))?'selected':''}"><td>${rowActions?rowActions(r):renderRowActions(r.id,selected.has(String(r.id)),{selectable:showEdit&&!draft,editable:showEdit&&!draft,deletable:draft||!!onDelete,deleteDisabled:!draft&&deleteDisabled(r)})}</td>${fields.map(f=>`<td data-column-key="${f.key}" class="${edit&&!readOnly(f,r)?'inline-edit-cell':''} ${f.format==='money'?'money':''}">${cell(f,r,edit)}</td>`).join('')}</tr>`;
    }).join('')});
  root.querySelector('.standard-data-table').dataset.listingKey=JSON.stringify([kind,state.page,state.filters]);
  // Reserve editor space in reading mode too, so dates and amounts stay legible
  // without making the columns expand when the operator clicks Edit.
  const headers=root.querySelectorAll('thead th');
  fields.forEach((field,index)=>{
    if(field.width)headers[index+1].style.width=`${field.width}px`;
    headers[index+1].style.minWidth=`${field.minWidth??(field.type==='textarea'?300:field.key==='status'?150:180)}px`;
  });
  if(drafts.length){drafts.restore(root);prepareQuickRegistrationRow(root);}
  if(editing){
    root.querySelectorAll('[data-table-control="previous-page"],[data-table-control="next-page"],[data-row-edit],[data-row-delete]:not([data-row-delete^="draft"]),[data-table-control="export"],[data-table-control="import"]').forEach(b=>b.disabled=true);
    if(state.editing&&showNew)root.querySelector('[data-table-control="new"]').disabled=true;
  }
  const error=message=>{
    let panel=root.querySelector('[data-save-error]');
    if(!panel){panel=document.createElement('p');panel.className='form-error table-error';panel.dataset.saveError='';panel.setAttribute('role','alert');root.querySelector('.table-scroll').after(panel);}
    panel.textContent=message;notify(message);
  };
  const save=async items=>{
    const table=root.querySelector('.standard-data-table');
    const focused=document.activeElement,focusRow=focused.closest('[data-record-row]')?.dataset.recordRow;
    const controls=[...table.querySelectorAll('input,select,textarea')].map(control=>[control,control.disabled]);
    table.setAttribute('aria-busy','true');controls.forEach(([control])=>control.disabled=true);
    try{await onSave(items);reset();ctx.tableIntent={focusRow};await ctx.refresh();notify('Alterações salvas.');}
    finally{
      if(table.isConnected){
        ctx.tableIntent=null;table.removeAttribute('aria-busy');
        controls.forEach(([control,disabled])=>control.disabled=disabled);
        if(focused.isConnected&&document.activeElement===document.body)focused.focus({preventScroll:true});
      }
    }
  };
  const selectChanged=()=>{
    root.querySelectorAll('[data-row-select]').forEach(b=>{const yes=selected.has(b.dataset.rowSelect);b.classList.toggle('selected',yes);b.closest('tr').classList.toggle('selected',yes);});
    updateTableSelection(root,selected.size);
    const all=matching.length>0&&matching.every(row=>selected.has(String(row.id)));
    const control=root.querySelector('[data-table-control="select-all"]');
    if(control){control.querySelector('span').textContent=all?`Desmarcar ${matching.length} registros`:'Selecionar todos';control.setAttribute('aria-label',control.querySelector('span').textContent);control.dataset.tooltip=control.querySelector('span').textContent;control.title='Todos os registros filtrados, em todas as páginas';control.disabled=editing||!matching.length;}
  };
  bindStandardDataTable(root,{
    onNew:()=>{drafts.add(root);state.editing=false;ctx.tableIntent={revealRow:drafts.records.at(-1).id,field:focusField};ctx.render();},
    onEdit:()=>{if(editing)reset();else state.editing=true;ctx.render();},
    onRowEdit:id=>{selected.clear();selected.add(id);state.editing=true;ctx.render();},
    onSave:async()=>{
      const invalid=[...root.querySelectorAll('[data-inline-field]')].find(input=>!input.checkValidity());
      if(invalid){invalid.reportValidity();return;}
      const values=drafts.length?drafts.values(root).map(r=>Object.fromEntries(fields.map(f=>[f.key,r[f.key]])))
        :visible.filter(r=>isRowEditing(state.editing,selected,r.id)).map(r=>({id:r.id,...inlineRecordValues(root,r.id)}));
      try{await save(values);}catch(e){error(e.message);}
    },
    onBatch:async()=>{
      const selection=rows.filter(r=>selected.has(String(r.id)));
      const change=await requestBatchEdit({context:ctx,fields:fields.filter(f=>f.batch!==false && selection.every(r=>!readOnly(f,r)))});
      if(!change)return;
      try{await save(selection.map(r=>({id:r.id,...(change.values||{[change.field]:change.value})})));}catch(e){error(e.message);}
    },
    onDuplicate:()=>{
      const chosen=selected.size?matching.filter(r=>selected.has(String(r.id))):visible;
      drafts.duplicate(root,chosen,duplicate);selected.clear();state.editing=false;ctx.tableIntent={revealRow:drafts.records[0]?.id,field:focusField};ctx.render();
    },
    onRowDelete:async id=>{if(drafts.has(id)){drafts.remove(root,id);ctx.render();return;}await onDelete?.(Number(id));},
    onSelectAll:()=>{toggleTableSelection(selected,matching);selectChanged();},
    onRowSelect:id=>{selected.has(id)?selected.delete(id):selected.add(id);selectChanged();},
    onPreviousPage:()=>{state.page--;ctx.render();},onNextPage:()=>{state.page++;ctx.render();},
    onImport,
    onExport:async()=>{const wanted=new Set(matching.filter(r=>!selected.size||selected.has(String(r.id))).map(r=>r.id));if(onExport){try{await onExport([...wanted]);}catch(e){error(e.message);}}else downloadCsv(`${kind}.csv`,exportRows.filter(r=>wanted.has(r.id)).map(exportRow));},
    onAction,onError:e=>error(e.message)
  });
  selectChanged();
  bindTableFilter(ctx,{fields,values:state.filters,onApply:values=>{state.filters=values;state.page=1;selected.clear();ctx.render();}});
  root.onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&editing){e.preventDefault();root.querySelector('[data-table-control="save"]').click();}};
  return matching;
}
