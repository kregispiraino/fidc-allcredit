import { renderListing,listingState } from '../../../components/tables/listing.js';
import { openForm,selectField } from '../../../components/modals/form-modal.js';
import { esc,money,date,notify } from '../../../utils/presentation.js';
import { loadControlRecord } from './api.js';
import { itemLabel,itemTypes } from './item-form.js';
import { compositionState,draftFor,switchTitleTab } from './composition-state.js';
const situations={dispensado:'Sem pendência na base',compensado:'Compensado por ajuste',em_conciliacao:'Aguarda saída',liquidado:'Liquidado',vinculo_provisorio:'Vínculo provisório',divergencia:'Divergência',alocacao_incompleta:'Revisar alocações',sem_credito:'Aguarda crédito',recebimento_sem_titulo:'Recebimento sem título',sem_titulo:'Saída sem título',sem_vinculo:'Sem vínculo',aplicado:'Aplicado'};
const amount=value=>value==null?'Não informado':money(value);
export async function showControlRecord(ctx,id){
  try{
    const r=await loadControlRecord(id);
    const dialog=openForm({title:`${itemLabel(r.tipo)} · ${r.titulo||'Item sem título'}`,description:`${r.cedente||'—'} → ${r.sacado||'—'}`,wide:true,readOnly:true,
      content:`<div class="control-record-summary"><p><strong>Valor do item:</strong> ${amount(r.valor)} · <strong>Liquidação do título:</strong> ${date(r.data_liquidacao)}</p><p><strong>Recebimento(s):</strong> ${esc(r.recebimentos||'Não informado')} · ${date(r.data_recebimento)}</p><p><strong>Condição original:</strong> ${esc(r.status_origem||'Não informada')} · <strong>Situação atual:</strong> ${esc(situations[r.situacao])}</p><p><strong>Saldo calculado:</strong> ${amount(r.saldo_calculado)} · <strong>Saldo informado na fonte:</strong> ${amount(r.saldo_origem)}</p><p>${esc(r.observacao_revisao||'')}</p><p>${esc(r.observacao||'')}</p>${r.total_compensado?`<p><strong>Saldo antes do ajuste:</strong> ${amount(r.saldo_antes_compensacao)} · <strong>Compensação:</strong> ${amount(r.total_compensado)}</p>${r.compensacoes.map(c=>`<p>Ajuste de controle em ${esc(c.codigo)}: ${amount(c.valor)}. ${esc(c.cedente)}</p>`).join('')}`:''}</div>
      <div class="table-scroll"><table class="title-table"><thead><tr><th>Transferência</th><th>Etapa</th><th>Data</th><th>Alocação atual</th><th>Alocação original</th></tr></thead><tbody>${r.vinculos.map(v=>`<tr><td><button type="button" class="text-link" data-open-control-transfer="${v.transferencia_id}">${esc(v.codigo)}</button>${v.extrato_id?'':'<span class="cell-sub">Sem movimentação associada</span>'}</td><td>${v.efeito==='compensacao'?'Compensação de saldo':v.tipo==='conciliacao'?'Entrada / Conciliação':'Saída / Liquidação'}${v.origem_posicao==='debito_2'?' · 2':''}</td><td>${date(v.data)}</td><td class="money">${amount(v.valor==null?null:v.valor*(v.tipo==='conciliacao'?1:-1))}</td><td class="money">${amount(v.valor_alocado_origem)}</td></tr>`).join('')}</tbody></table></div>`});
    dialog.querySelectorAll('[data-open-control-transfer]').forEach(button=>button.onclick=()=>{
      const transfer=ctx.data.transferencias.find(t=>t.id===Number(button.dataset.openControlTransfer));
      const state=compositionState({...ctx,state:{...ctx.state,tab:'rastreio'}});state.work.selected=transfer.extrato_id??`tr-${transfer.id}`;
      dialog.close();ctx.navigate('workflow','rastreio','rastreio');
    });
  }catch(error){notify(error.message);}
}
function composeExit(ctx,record){
  const context={...ctx,state:{...ctx.state,tab:'liquidacao'}},state=compositionState(context);
  if(!state.entries.length){notify('Não há saída pendente. Cadastre ou importe a movimentação antes de compor a liquidação.');return;}
  openForm({title:`Compor saída · ${record.titulo||itemLabel(record.tipo)}`,description:'O vínculo entra como rascunho. Confira a composição e salve na aba Liquidação.',submitLabel:'Adicionar à composição',
    content:`<div class="form-grid">${selectField('destino','Saída',state.entries.map(e=>({value:e.id,label:`${e.codigo||`Extrato #${e.id}`} · ${date(e.data)} · ${money(Math.abs(e.valor))}`})))}<label class="form-field"><span>Valor alocado (R$)</span><input name="valor" type="number" data-input-format="money" step="0.01" min="0.01" required value="${record.saldo_calculado>0?(record.saldo_calculado/100).toFixed(2):''}"></label></div>`,
    onSubmit:async form=>{
      const value=Math.round(Number(form.get('valor'))*100);if(!Number.isSafeInteger(value)||value<=0)throw new Error('Informe o valor alocado nesta saída.');
      const entry=state.entries.find(e=>String(e.id)===form.get('destino')),transfer=state.transfers.get(entry.id),draft=draftFor(ctx,state.work,entry,transfer);
      const existing=draft.itens.find(item=>item.registro_id===record.id);
      if(existing){existing.valor=value;existing._valueInput=undefined;existing._invalid=false;}
      else draft.itens.push({_key:crypto.randomUUID(),registro_id:record.id,tipo:record.tipo,titulo:record.titulo,cedente:record.cedente,sacado:record.sacado,valor:value,data_liquidacao:record.data_liquidacao});
      delete draft.editSnapshot;draft.dirty=true;state.work.editing=false;state.work.selected=entry.id;switchTitleTab(state.work,'vinculados');state.work.filters={};state.work.query='';
      ctx.navigate('workflow','rastreio','liquidacao');
    }});
}
export function renderPendencias(ctx){
  const state=ctx.pageState.controle??=listingState();state.size=25;
  const rows=(ctx.data.registros||[]).filter(r=>r.aguarda_saida);
  const fields=[{key:'tipo',label:'Tipo',type:'select',options:itemTypes,display:r=>itemLabel(r.tipo)},
    {key:'titulo',label:'Título / item',type:'text',render:r=>`<button class="text-link" data-control-record="${r.id}">${esc(r.titulo||'Ver percurso')}</button>`},
    {key:'cedente',label:'Cedente',type:'text'},{key:'sacado',label:'Sacado',type:'text'},
    {key:'saldo_calculado',label:'Saldo na conciliação',type:'number',format:'money',display:r=>amount(r.saldo_calculado),filterValue:r=>r.saldo_calculado==null?null:r.saldo_calculado/100},
    {key:'situacao',label:'Situação',type:'select',options:Object.entries(situations).map(([value,label])=>({value,label})),render:r=>`<span class="status-pill ${r.pendente?'pending':'reconciled'}">${esc(situations[r.situacao])}</span><span class="cell-sub">${esc(r.revisado_em?'Revisado':r.status_origem||'Condição original não informada')}</span>`},
    {key:'codigos_credito',label:'Entrada / crédito',type:'text'},{key:'codigos_debito',label:'Saída / débito',type:'text'}];
  renderListing(ctx,{state,rows,fields,kind:'workflow-rastreio-pendencias',showNew:false,showEdit:false,showDuplicate:false,
    rowActions:r=>`<button type="button" class="text-link" data-control-record="${r.id}">Ver percurso</button>${ctx.canWrite===false?'':`<button type="button" class="text-link" data-control-exit="${r.id}">Compor saída</button>`}`,
    exportRow:r=>({Tipo:itemLabel(r.tipo),Título:r.titulo,Cedente:r.cedente,Sacado:r.sacado,Saldo:r.saldo_calculado==null?'':(r.saldo_calculado/100).toFixed(2),Situação:situations[r.situacao],'Condição original':r.status_origem||'',Crédito:r.codigos_credito,Débito:r.codigos_debito})});
  ctx.root.querySelector('.standard-data-table').dataset.scrollMode='page';
  ctx.root.querySelectorAll('[data-control-record]').forEach(button=>button.onclick=()=>showControlRecord(ctx,Number(button.dataset.controlRecord)));
  ctx.root.querySelectorAll('[data-control-exit]').forEach(button=>button.onclick=()=>composeExit(ctx,rows.find(r=>r.id===Number(button.dataset.controlExit))));
  return [['Aguardam saída',rows.length]];
}
