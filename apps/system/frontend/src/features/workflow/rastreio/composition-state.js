export function compositionState(ctx) {
  const tab=ctx.state.tab,review=tab==='rastreio';
  const work=ctx.pageState[tab]??={selected:null,titleTab:review?'vinculados':'todos',query:'',filters:{},pendingFilters:{},page:1,drafts:{}};
  const accounts=ctx.data.contas.filter(account=>account.status==='active'&&account.funcao==='rastreada').map(account=>account.id);
  const transfers=new Map(ctx.data.transferencias.map(row=>[row.extrato_id??`tr-${row.id}`,row]));
  const unmatched=ctx.data.transferencias.filter(row=>!row.extrato_id).map(row=>({id:`tr-${row.id}`,data:row.data,historico:row.historico,valor:row.movimento_valor,conta_id:row.conta_id,codigo:row.codigo}));
  const entries=[...ctx.data.extrato,...unmatched].map(entry=>({...entry,valor:entry.valor+(entry.valor_subcentavos||0)/100})).map(entry=>({...entry,codigo:transfers.get(entry.id)?.codigo})).filter(entry=>review?transfers.has(entry.id):entry.rastreio_condicao!=='legado_sem_rastreio'&&(!transfers.has(entry.id)||transfers.get(entry.id).pendente)&&accounts.includes(entry.conta_id)&&(tab==='conciliacao'?entry.valor>0:entry.valor<0)).sort((a,b)=>b.data.localeCompare(a.data));
  return {tab,review,work,entries,transfers,accounts};
}
export function draftFor(ctx,work,entry,transfer) {
  if(!entry)return {itens:[],dirty:false};
  if(work.drafts[entry.id]&&!work.drafts[entry.id].dirty&&work.drafts[entry.id].versao!==transfer?.versao)delete work.drafts[entry.id];
  return work.drafts[entry.id]??={versao:transfer?.versao,dirty:false,itens:transfer?ctx.data.itens.filter(item=>item.transferencia_id===transfer.id).map(item=>({...item,_key:`saved-${item.id}`})):[]};
}
export const itemPayload=item=>({...item.id?{id:item.id}:{},registro_id:item.registro_id||null,qprof_titulo_id:item.qprof_titulo_id||null,tipo:item.tipo,titulo:item.titulo,cedente:item.cedente,sacado:item.sacado,valor_reais:item.valor===null?null:(item.valor/100).toFixed(2)});
export function sourceItem(source){return {_key:crypto.randomUUID(),qprof_titulo_id:source.id,tipo:'titulo',titulo:source.numero,cedente:source.cedente,sacado:source.sacado,valor:source.valor,data_liquidacao:source.data_liquidacao,carteira:source.carteira,carteira_interna:source.carteira_interna};}

// The source lookup and the saved/manual composition have independent search criteria.
export function switchTitleTab(work,next){
  if(work.titleTab===next)return;
  work.titleViews??={};
  work.titleViews[work.titleTab]={query:work.query,filters:work.filters,page:work.page};
  Object.assign(work,work.titleViews[next]||{query:'',filters:{},page:1});
  work.titleTab=next;
}
