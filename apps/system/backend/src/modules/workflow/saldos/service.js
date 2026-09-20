import { transaction } from '../../../infrastructure/database/connection.js';
import { assert, positiveId } from '../../../shared/errors.js';
import { parseCents } from '../../../shared/money.js';

export function listSaldos(db) {
  return db.prepare(`SELECT s.*,c.nome conta FROM workflow_saldos s
    JOIN gerenciador_contas c ON c.id=s.conta_id WHERE c.status='active' ORDER BY c.nome`).all();
}
export function saveSaldos(db,items) {
  assert(Array.isArray(items)&&items.length>0&&items.length<=500,'Envie de 1 a 500 saldos.');
  return transaction(db,()=>items.map(item=>{
    assert(item&&typeof item==='object'&&!Array.isArray(item),'Saldo inválido.');
    assert(Object.keys(item).every(key=>['id','saldo_final_reais'].includes(key))&&'saldo_final_reais' in item,'Apenas o saldo final pode ser editado.');
    const id=positiveId(item.id);
    assert(db.prepare("SELECT 1 FROM gerenciador_contas WHERE id=? AND status='active'").get(id),'Conta ativa não encontrada.',404);
    const value=item.saldo_final_reais;
    const cents=value===null||String(value).trim()===''?null:parseCents(value,{allowZero:true});
    db.prepare('UPDATE workflow_saldos SET saldo_final=?,updated_at=CASE WHEN saldo_banco IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END WHERE conta_id=?').run(cents,id);
    return db.prepare('SELECT * FROM workflow_saldos WHERE conta_id=?').get(id);
  }));
}
