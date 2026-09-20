import { esc } from '../../../utils/presentation.js';
export function renderAccountFilter(ctx,state) {
  const accounts=ctx.data.contas_filtro;
  let selected=String(state.filters.conta_id||'');
  if(selected&&!accounts.some(account=>String(account.id)===selected)){
    delete state.filters.conta_id;state.page=1;state.selected.clear();selected='';
  }
  ctx.actions.innerHTML=`<div class="extrato-account-filter"><select id="extratoAccountFilter" aria-label="Selecionar conta" data-select-filter data-select-search ${state.editing||state.drafts.length?'disabled':''}>
    <option value="">Todas as contas</option>${accounts.map(account=>`<option value="${account.id}" ${selected===String(account.id)?'selected':''}>${esc(account.nome)}</option>`).join('')}</select></div>`;
  ctx.actions.querySelector('select').onchange=event=>{
    if(event.target.value)state.filters.conta_id=event.target.value;else delete state.filters.conta_id;
    state.page=1;state.selected.clear();ctx.tableIntent={top:true};ctx.render();
  };
}
