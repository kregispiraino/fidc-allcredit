import { parseExactAmount, exactDecimal } from '../../../shared/money.js';
import { listRegistrations } from '../../gerenciador/shared/service.js';
import { transaction } from '../../../infrastructure/database/connection.js';
import { assert, positiveId } from '../../../shared/errors.js';

export function validateExtratoRow(db,item) {
  const fields=['status','data','entidade_id','natureza_id','historico','conta_id','valor_reais'];
    assert(item && typeof item==='object' && !Array.isArray(item),'Movimentação inválida.');
    assert(Object.keys(item).every(k=>k==='id'||fields.includes(k)),'Campos de movimentação inválidos.');
    const id=item.id==null?null:positiveId(item.id);
    const current=id?db.prepare('SELECT * FROM workflow_extrato WHERE id=?').get(id):null;
    assert(!id || current,'Movimentação não encontrada.',404);
    const row={status:'pending',entidade_id:null,natureza_id:null,...current,...item};
    if('valor_reais' in item)Object.assign(row,parseExactAmount(item.valor_reais));
    else {row.valor=current?.valor;row.valor_subcentavos=current?.valor_subcentavos??0;}
    assert(Number.isSafeInteger(row.valor),'Informe o valor da movimentação.');
    assert(['pending','reconciled','reversal'].includes(row.status),'Status inválido.');
    assert(typeof row.data==='string' && /^\d{4}-\d{2}-\d{2}$/.test(row.data),'Informe uma data válida.');
    const day=new Date(`${row.data}T00:00:00Z`);
    assert(Number.isFinite(day.getTime()) && day.toISOString().slice(0,10)===row.data,'Informe uma data válida.');
    row.historico=String(row.historico??'');
    assert(row.historico.trim().length>0 && row.historico.length<=4000,'Informe o histórico com até 4.000 caracteres.');
    for(const [field,table]of [['conta_id','contas'],['entidade_id','entidades'],['natureza_id','naturezas']]) {
      row[field]=row[field]===''||row[field]==null?null:positiveId(row[field]);
      if(field!=='conta_id' && row[field]===null)continue;
      assert(row[field]!==null,'Selecione uma conta.');
      const related=db.prepare(`SELECT * FROM gerenciador_${table} WHERE id=?`).get(row[field]);
      assert(related,'Cadastro relacionado não encontrado.');
      if(field==='conta_id')assert(related.funcao!=='neutra','Contas neutras permitem apenas controle de saldos.');
      assert(related.status==='active'||current?.[field]===row[field],'Selecione um cadastro ativo.');
    }
    return row;
}
export function saveExtratoRows(db,items,{limit=500,beforeWrite=()=>{}}={}) {
  assert(Array.isArray(items)&&items.length>0&&items.length<=limit,`Envie de 1 a ${limit} movimentações.`);
  return transaction(db,()=>{
    beforeWrite();
    return items.map(item=>writeExtratoRow(db,item));
  });
}
// Shared writer for callers already inside a transaction.
export function writeExtratoRow(db,item) {
  const row=validateExtratoRow(db,item),id=row.id||null;
  const values=[row.status,row.data,row.entidade_id,row.natureza_id,row.historico,row.valor,row.conta_id,row.valor_subcentavos];
  if(id)db.prepare('UPDATE workflow_extrato SET status=?,data=?,entidade_id=?,natureza_id=?,historico=?,valor=?,conta_id=?,valor_subcentavos=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(...values,id);
  else row.id=Number(db.prepare('INSERT INTO workflow_extrato(status,data,entidade_id,natureza_id,historico,valor,conta_id,valor_subcentavos) VALUES(?,?,?,?,?,?,?,?)').run(...values).lastInsertRowid);
  return db.prepare('SELECT * FROM workflow_extrato WHERE id=?').get(id||row.id);
}

export function deleteExtratoRow(db,id) {
  id=positiveId(id);
  const entry=db.prepare('SELECT * FROM workflow_extrato WHERE id=?').get(id);
  assert(entry,'Movimentação não encontrada.',404);
  db.prepare('DELETE FROM workflow_extrato WHERE id=?').run(id);
  return {deleted:true};
}

export function listExtrato(db) {
  return db.prepare(`SELECT e.*, tr.id rastreio_id,tr.codigo rastreio_codigo, c.nome conta, en.nome entidade, n.nome natureza FROM workflow_extrato e
    JOIN gerenciador_contas c ON c.id=e.conta_id LEFT JOIN gerenciador_entidades en ON en.id=e.entidade_id
    LEFT JOIN gerenciador_naturezas n ON n.id=e.natureza_id LEFT JOIN workflow_rastreio_transferencias tr ON tr.extrato_id=e.id WHERE c.funcao!='neutra' ORDER BY e.data DESC,e.id DESC`).all().map(row=>({...row,valor_reais:exactDecimal(row.valor,row.valor_subcentavos)}));
}

export function classifyExtrato(db, payload) {
  const { ids, changes }=payload;
  assert(Array.isArray(ids) && ids.length && ids.length<=2000, 'Selecione as movimentações.');
  assert(changes && typeof changes==='object' && !Array.isArray(changes), 'Classificação inválida.');
  const keys=Object.keys(changes);
  assert(keys.length && keys.every(k=>['status','entidade_id','natureza_id'].includes(k)), 'Campos de classificação inválidos.');
  if ('status' in changes) assert(['pending','reconciled','reversal'].includes(changes.status), 'Status inválido.');
  return transaction(db,()=>{
    for (const [field,table] of [['entidade_id','gerenciador_entidades'],['natureza_id','gerenciador_naturezas']]) {
      if (field in changes && changes[field]!==null) {
        positiveId(changes[field]);
        assert(db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(changes[field]),'Cadastro não encontrado.');
      }
    }
    for (const rawId of new Set(ids)) {
      const id=positiveId(rawId), entry=db.prepare('SELECT * FROM workflow_extrato WHERE id=?').get(id);
      assert(entry,'Movimentação não encontrada.',404);
      db.prepare(`UPDATE workflow_extrato SET ${keys.map(k=>`${k}=?`).join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...keys.map(k=>changes[k]),id);
    }
    return { updated:new Set(ids).size };
  });
}

export function extratoData(db) {
  const contas=listRegistrations(db,'contas');
  return {extrato:listExtrato(db),contas_filtro:contas.filter(conta=>conta.status==='active'),contas:contas.filter(conta=>conta.funcao!=='neutra'),naturezas:listRegistrations(db,'naturezas'),entidades:listRegistrations(db,'entidades')};
}
