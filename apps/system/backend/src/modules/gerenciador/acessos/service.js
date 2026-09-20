import { assert, positiveId } from '../../../shared/errors.js';
import { transaction } from '../../../infrastructure/database/connection.js';
import { hashPassword } from './password.js';
export const publicAccess=row=>row?{id:row.id,login:row.login,acesso:row.acesso}:null;
export const listAccess=db=>db.prepare('SELECT id,login,acesso FROM gerenciador_acessos ORDER BY login').all();
export function saveAccess(db,id,body){
  assert(body&&Object.keys(body).every(key=>['login','senha','acesso'].includes(key)),'Campos de acesso inválidos.');
  const login=String(body.login||'').trim().toLowerCase();
  assert(/^[a-z0-9][a-z0-9._-]{0,63}$/.test(login),'Use até 64 letras, números, pontos, traços ou sublinhados no login.');
  assert(['operador','visualizador'].includes(body.acesso),'Selecione Operador ou Visualizador.');
  const hash=body.senha?hashPassword(body.senha):null;
  if(!id)assert(hash,'Informe a senha do novo acesso.');
  return transaction(db,()=>{
    if(id){
      id=positiveId(id);const current=db.prepare('SELECT * FROM gerenciador_acessos WHERE id=?').get(id);assert(current,'Acesso não encontrado.',404);
      if(current.acesso==='operador'&&body.acesso!=='operador')assert(db.prepare("SELECT count(*) n FROM gerenciador_acessos WHERE acesso='operador'").get().n>1,'Mantenha pelo menos um operador no sistema.');
      db.prepare('UPDATE gerenciador_acessos SET login=?,acesso=?,senha_hash=COALESCE(?,senha_hash),updated_at=CURRENT_TIMESTAMP WHERE id=?').run(login,body.acesso,hash,id);
      // Password changes revoke this account on every device, including saved accounts.
      if(hash)db.prepare('DELETE FROM sistema_sessao_contas WHERE acesso_id=?').run(id);
    }else id=Number(db.prepare('INSERT INTO gerenciador_acessos(login,senha_hash,acesso) VALUES(?,?,?)').run(login,hash,body.acesso).lastInsertRowid);
    return publicAccess(db.prepare('SELECT * FROM gerenciador_acessos WHERE id=?').get(id));
  });
}
export function deleteAccess(db,id){
  id=positiveId(id);
  return transaction(db,()=>{
    const user=db.prepare('SELECT acesso FROM gerenciador_acessos WHERE id=?').get(id);assert(user,'Acesso não encontrado.',404);
    if(user.acesso==='operador')assert(db.prepare("SELECT count(*) n FROM gerenciador_acessos WHERE acesso='operador'").get().n>1,'Mantenha pelo menos um operador no sistema.');
    db.prepare('DELETE FROM gerenciador_acessos WHERE id=?').run(id);return {deleted:true};
  });
}
