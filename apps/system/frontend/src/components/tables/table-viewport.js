// A redraw must not change the operator's place in the current result set.
// Pagination/filtering have a different result key and intentionally start at the top.
const actionAttributes=['data-table-control','data-row-edit','data-row-delete','data-row-select'];
const findRow=(table,id)=>[...table.querySelectorAll('[data-record-row]')].find(row=>row.dataset.recordRow===String(id));
const visibleControl=source=>source?.parentElement.querySelector('[data-input-proxy],[data-date-proxy],.standard-select-trigger')||source;

export function captureTableViewport(root) {
  const table=root.querySelector('[data-listing-key]'),scroll=table?.querySelector('.table-scroll');
  if(!scroll)return null;
  const bounds=scroll.getBoundingClientRect(),active=document.activeElement;
  const row=active?.closest('[data-record-row]');
  const source=active?.matches('[data-inline-field]')?active:active?.closest('td')?.querySelector('[data-inline-field]');
  const action=actionAttributes.find(attr=>active?.hasAttribute(attr));
  return {key:table.dataset.listingKey,viewportWidth:scroll.clientWidth,
    top:scroll.scrollTop,left:scroll.scrollLeft,windowX:window.scrollX,windowY:window.scrollY,
    columns:[...scroll.querySelectorAll('thead th')].map(th=>th.getBoundingClientRect().width),
    anchors:[...scroll.querySelectorAll('[data-record-row]')].map(row=>({id:row.dataset.recordRow,top:row.getBoundingClientRect().top-bounds.top,bottom:row.getBoundingClientRect().bottom-bounds.top}))
      .filter(row=>row.bottom>0&&row.top<bounds.height),
    focus:table.contains(active)?{row:row?.dataset.recordRow,field:source?.dataset.inlineField,
      action,value:action&&active.getAttribute(action),start:active.selectionStart,end:active.selectionEnd}:null};
}

export function restoreTableViewport(root,snapshot,intent) {
  const table=root.querySelector('[data-listing-key]'),scroll=table?.querySelector('.table-scroll');
  if(!scroll)return;
  if(snapshot?.key===table.dataset.listingKey) {
    const grid=scroll.querySelector('table');
    // Freeze the measured columns, including when editors are wider than their text.
    // Only reuse the measurements when the available viewport has not changed.
    if(Math.abs(snapshot.viewportWidth-scroll.clientWidth)<2&&snapshot.columns.length===grid.querySelectorAll('thead th').length) {
      const columns=document.createElement('colgroup');
      for(const width of snapshot.columns){const col=document.createElement('col');col.style.width=`${width}px`;columns.append(col);}
      grid.prepend(columns);table.classList.add('stable-table-layout');
      grid.style.width=`${snapshot.columns.reduce((sum,width)=>sum+width,0)}px`;
    }
    scroll.scrollTop=snapshot.top;
    const anchor=snapshot.anchors.find(anchor=>findRow(table,anchor.id));
    if(anchor)scroll.scrollTop+=findRow(table,anchor.id).getBoundingClientRect().top-scroll.getBoundingClientRect().top-anchor.top;
    scroll.scrollLeft=snapshot.left;
    const focus=snapshot.focus;
    if(focus) {
      const row=findRow(table,focus.row);
      let target;
      if(focus.field)target=visibleControl([...(row?.querySelectorAll('[data-inline-field]')||[])].find(input=>input.dataset.inlineField===focus.field));
      if(!target&&focus.action)target=[...table.querySelectorAll(`[${focus.action}]`)].find(button=>button.getAttribute(focus.action)===focus.value);
      if(target?.disabled&&focus.action==='data-row-edit')target=visibleControl(row?.querySelector('[data-inline-field]'));
      if(!target&&row)target=row.querySelector('[data-row-edit]');
      if(!target&&focus.row&&anchor)target=findRow(table,anchor.id).querySelector('[data-row-delete]:not(:disabled),[data-row-select]:not(:disabled)');
      target?.focus({preventScroll:true});
      if(focus.start!=null&&target?.setSelectionRange)try{target.setSelectionRange(focus.start,focus.end);}catch{}
    }
    window.scrollTo({left:snapshot.windowX,top:snapshot.windowY,behavior:'instant'});
  }
  if(table.dataset.scrollMode==='page'&&(intent?.top||snapshot&&snapshot.key!==table.dataset.listingKey)) {
    const top=table.getBoundingClientRect().top+window.scrollY;
    window.scrollTo({top:intent?.top?0:Math.min(window.scrollY,top),behavior:'instant'});
  }
  if(intent?.focusRow)findRow(table,intent.focusRow)?.querySelector('[data-row-edit]')?.focus({preventScroll:true});
  if(intent?.revealRow) {
    const row=findRow(table,intent.revealRow);
    if(!row)return;
    const source=[...row.querySelectorAll('[data-inline-field]')].find(input=>input.dataset.inlineField===intent.field)||row.querySelector('[data-inline-field]');
    const target=visibleControl(source),bounds=scroll.getBoundingClientRect(),rect=row.getBoundingClientRect();
    const header=scroll.querySelector('thead').getBoundingClientRect().height;
    if(table.dataset.scrollMode==='page'){
      const toolbar=table.querySelector('.table-toolbar').getBoundingClientRect();
      const inset=toolbar.height+(innerWidth<=760?64:0);
      if(rect.top<inset)window.scrollBy({top:rect.top-inset-8,behavior:'instant'});
      else if(rect.bottom>innerHeight)window.scrollBy({top:rect.bottom-innerHeight+12,behavior:'instant'});
    }
    else if(rect.top<bounds.top+header)scroll.scrollTop+=rect.top-bounds.top-header;
    else if(rect.bottom>bounds.bottom)scroll.scrollTop+=rect.bottom-bounds.bottom;
    if(target){const field=target.getBoundingClientRect();if(field.left<bounds.left)scroll.scrollLeft+=field.left-bounds.left-12;else if(field.right>bounds.right)scroll.scrollLeft+=field.right-bounds.right+12;target.focus({preventScroll:true});}
  }
}
