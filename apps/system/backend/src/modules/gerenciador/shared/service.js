import { assert, positiveId } from '../../../shared/errors.js';
import { transaction } from '../../../infrastructure/database/connection.js';

export function managerTable(kind) {
  assert(['naturezas','entidades','contas'].includes(kind),'Cadastro inexistente.',404);
  return `gerenciador_${kind}`;
}
export function writeRegistration(db,kind,id,body) {
  const table=managerTable(kind), field=kind==='contas'?'funcao':'classificacao';
  const nome=String(body.nome ?? '').trim(), value=String(body[field] ?? '').trim();
  assert(nome.length>0 && nome.length<=160,'Informe um nome de até 160 caracteres.');
  assert(value.length<=120&&(kind!=='contas'||value.length>0),'Preencha uma função válida ou uma classificação de até 120 caracteres.');
  assert(['active','inactive'].includes(body.status),'Status inválido.');
  if(kind==='contas') assert(['operacional','neutra','rastreada'].includes(value),'Função inválida.');
  if(id) {
    positiveId(id);
    assert(db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(id),'Cadastro não encontrado.',404);
    db.prepare(`UPDATE ${table} SET nome=?,${field}=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(nome,value,body.status,id);
  } else id=Number(db.prepare(`INSERT INTO ${table}(nome,${field},status) VALUES(?,?,?)`).run(nome,value,body.status).lastInsertRowid);
  return db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
}
export function saveRegistration(db,kind,id,body) {
  return transaction(db,()=>writeRegistration(db,kind,id,body));
}
export function saveRegistrations(db,kind,items) {
  const table=managerTable(kind);
  assert(Array.isArray(items) && items.length>0 && items.length<=500,'Envie de 1 a 500 cadastros.');
  return transaction(db,()=>items.map(item=>{
    assert(item && typeof item==='object' && !Array.isArray(item),'Cadastro inválido.');
    const id=item.id==null?null:positiveId(item.id);
    const current=id?db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id):{};
    assert(current,'Cadastro não encontrado.',404);
    return writeRegistration(db,kind,id,{...current,...item});
  }));
}
export function deleteRegistration(db,kind,id) {
  const result=db.prepare(`DELETE FROM ${managerTable(kind)} WHERE id=?`).run(positiveId(id));
  assert(result.changes,'Cadastro não encontrado.',404);
  return { deleted:true };
}
export function listRegistrations(db,kind) {
  return db.prepare(`SELECT * FROM ${managerTable(kind)} ORDER BY nome`).all();
}
