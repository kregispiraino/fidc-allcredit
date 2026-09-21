export const pendingSelected=(draft,row)=>draft.itens.find(item=>(row.registro_ids||[row.id]).includes(item.registro_id));
export function pendingItem(row){return {_key:crypto.randomUUID(),registro_id:row.id,tipo:row.tipo,titulo:row.titulo,cedente:row.cedente,sacado:row.sacado,valor:row.saldo_calculado>0?row.saldo_calculado:null,data_liquidacao:row.data_liquidacao};}
export function togglePending(draft,rows,remove=false){
  const ids=new Set(rows.flatMap(row=>row.registro_ids||[row.id]));
  if(remove)draft.itens=draft.itens.filter(item=>!ids.has(item.registro_id));
  else draft.itens.push(...rows.filter(row=>!pendingSelected(draft,row)).map(pendingItem));
  draft.dirty=true;
}
export const trackingTitle=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toUpperCase().replace(/[^\p{L}\p{N}]/gu,'');
export function matchingTransfers(items,query){
  const title=trackingTitle(query);
  return new Set(items.filter(item=>['titulo','parcial'].includes(item.tipo)&&trackingTitle(item.titulo).includes(title)).map(item=>item.transferencia_id));
}
