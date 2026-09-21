import { itemTypes, ensureControlRecord, titleRegistry } from './registros.js';
import { assert, positiveId } from '../../../shared/errors.js';
import { parseCents } from '../../../shared/money.js';

export function validateItems(db,items,transferId=null) {
  assert(Array.isArray(items)&&items.length<=2000,'Envie até 2.000 itens na composição.');
  const seen=new Set();
  return items.map(item=>{
    assert(item&&typeof item==='object'&&!Array.isArray(item),'Item da composição inválido.');
    assert(Object.keys(item).every(key=>['id','registro_id','qprof_titulo_id','tipo','titulo','cedente','sacado','valor_reais'].includes(key)),'Campos do item inválidos.');
    const id=item.id==null?null:positiveId(item.id);
    if(id){
      assert(transferId&&!seen.has(id)&&db.prepare('SELECT 1 FROM workflow_rastreio_itens WHERE id=? AND transferencia_id=?').get(id,transferId),'Item não pertence a esta composição ou está repetido.',409);
      seen.add(id);
    }
    const existing=id?db.prepare('SELECT * FROM workflow_rastreio_itens WHERE id=? AND transferencia_id=?').get(id,transferId):null;
    const registroId=item.registro_id==null?existing?.registro_id??null:positiveId(item.registro_id);
    assert(!existing?.registro_id||existing.registro_id===registroId,'O registro de origem deste vínculo não pode ser trocado.');
    const registro=registroId?db.prepare('SELECT * FROM workflow_rastreio_registros WHERE id=?').get(registroId):null;
    assert(!registroId||registro,'Registro de rastreio não encontrado.');
    const sourceId=item.qprof_titulo_id==null?null:positiveId(item.qprof_titulo_id);
    const source=sourceId?db.prepare('SELECT * FROM importacao_qprof_titulos WHERE id=?').get(sourceId):null;
    assert(!sourceId||(source&&(source.ativo||existing?.qprof_titulo_id===sourceId)),'A base Qprof mudou. Remova o título do rascunho e busque novamente.',409);
    const row={id,registro_id:registroId,qprof_titulo_id:sourceId,tipo:item.tipo||registro?.tipo||'titulo',titulo:item.titulo??registro?.titulo??source?.numero??'',cedente:item.cedente??registro?.cedente??source?.cedente??'',sacado:item.sacado??registro?.sacado??source?.sacado??''};
    const metadata=existing||registro||source;
    row.data_liquidacao=metadata?.data_liquidacao??null;row.carteira=metadata?.carteira??'';row.carteira_interna=metadata?.carteira_interna??'';
    assert(itemTypes.includes(row.tipo),'Tipo de item inválido.');
    for(const field of ['titulo','cedente','sacado']){row[field]=String(row[field]).trim();assert(row[field].length<=160,'Título, cedente e sacado devem ter até 160 caracteres.');}
    assert(!['titulo','parcial'].includes(row.tipo)||row.titulo,'Informe o título para itens do tipo Título ou Parcial.');
    row.valor=existing?.origem_posicao&&(item.valor_reais===null||item.valor_reais==='')?null:item.valor_reais===undefined&&source?source.valor:parseCents(item.valor_reais,{allowZero:!!existing?.origem_posicao});
    row.efeito=existing?.efeito||'composicao';
    if(row.efeito==='compensacao')assert(row.tipo==='ajuste'&&row.valor>0,'A compensação deve permanecer como ajuste de valor positivo.');
    return row;
  });
}
export function saveItems(db,transferId,items) {
  const wanted=new Set(items.filter(item=>item.id).map(item=>item.id));
  for(const row of db.prepare('SELECT id FROM workflow_rastreio_itens WHERE transferencia_id=?').all(transferId)){
    if(!wanted.has(row.id))db.prepare('DELETE FROM workflow_rastreio_itens WHERE id=?').run(row.id);
  }
  const registry=titleRegistry(db);
  for(const item of items){
    const values=[item.qprof_titulo_id,item.tipo,item.titulo,item.cedente,item.sacado,item.valor,item.data_liquidacao,item.carteira,item.carteira_interna,ensureControlRecord(db,item,registry)];
    if(item.id)db.prepare('UPDATE workflow_rastreio_itens SET qprof_titulo_id=?,tipo=?,titulo=?,cedente=?,sacado=?,valor=?,data_liquidacao=?,carteira=?,carteira_interna=?,registro_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND transferencia_id=?').run(...values,item.id,transferId);
    else db.prepare('INSERT INTO workflow_rastreio_itens(qprof_titulo_id,tipo,titulo,cedente,sacado,valor,data_liquidacao,carteira,carteira_interna,registro_id,transferencia_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(...values,transferId);
  }
}
