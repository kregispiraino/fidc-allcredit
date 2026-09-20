import { createHash, randomBytes } from 'node:crypto';
import { assert, positiveId } from '../../../shared/errors.js';
import { transaction } from '../../../infrastructure/database/connection.js';
import { publicAccess } from '../../gerenciador/acessos/service.js';
import { hashPassword, verifyPassword } from '../../gerenciador/acessos/password.js';
export const sessionCookie='allcredit_fidc_session',sessionLifetime=30*24*60*60*1000;
const digest=token=>createHash('sha256').update(token).digest('hex');
const dummyHash=hashPassword(randomBytes(24).toString('hex'));
export function cookieOptions(req){return {httpOnly:true,sameSite:'lax',secure:req.app?.locals.production||req.secure,path:'/',maxAge:sessionLifetime};}
export function readSession(db,req){
  const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length+1);
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  return db.prepare('SELECT * FROM sistema_sessao WHERE token_hash=? AND expires_at>?').get(digest(token),Date.now())||null;
}
export function sessionData(db,session){
  if(!session)return {usuario:null,contas:[]};
  const contas=db.prepare('SELECT a.* FROM gerenciador_acessos a JOIN sistema_sessao_contas c ON c.acesso_id=a.id WHERE c.sessao_id=? ORDER BY a.login').all(session.id).map(publicAccess);
  return {usuario:contas.find(a=>a.id===session.acesso_id)||null,contas};
}
export function signIn(db,req,res,body){
  const login=String(body.login||'').trim().toLowerCase();
  assert(login.length<=64,'Login ou senha inválidos.',401);
  const user=db.prepare('SELECT * FROM gerenciador_acessos WHERE login=?').get(login);
  assert(verifyPassword(body.senha,user?.senha_hash||dummyHash)&&user,'Login ou senha inválidos.',401);
  const old=readSession(db,req),token=randomBytes(32).toString('hex');
  const session=transaction(db,()=>{
    db.prepare('DELETE FROM sistema_sessao WHERE expires_at<=?').run(Date.now());
    let id=old?.id;
    if(id)db.prepare('UPDATE sistema_sessao SET token_hash=?,acesso_id=?,expires_at=? WHERE id=?').run(digest(token),user.id,Date.now()+sessionLifetime,id);
    else id=Number(db.prepare('INSERT INTO sistema_sessao(token_hash,acesso_id,expires_at) VALUES(?,?,?)').run(digest(token),user.id,Date.now()+sessionLifetime).lastInsertRowid);
    db.prepare('INSERT OR IGNORE INTO sistema_sessao_contas(sessao_id,acesso_id) VALUES(?,?)').run(id,user.id);
    return db.prepare('SELECT * FROM sistema_sessao WHERE id=?').get(id);
  });
  res.cookie(sessionCookie,token,cookieOptions(req));return sessionData(db,session);
}
export function switchAccount(db,session,id){
  id=positiveId(id);assert(session&&db.prepare('SELECT 1 FROM sistema_sessao_contas WHERE sessao_id=? AND acesso_id=?').get(session.id,id),'Entre nesta conta antes de selecioná-la.',401);
  db.prepare('UPDATE sistema_sessao SET acesso_id=? WHERE id=?').run(id,session.id);
  return sessionData(db,{...session,acesso_id:id});
}
export function signOut(db,req,res,all=false){
  const session=readSession(db,req);
  if(!session)return {usuario:null,contas:[]};
  if(all)db.prepare('DELETE FROM sistema_sessao WHERE id=?').run(session.id);
  else{
    db.prepare('DELETE FROM sistema_sessao_contas WHERE sessao_id=? AND acesso_id=?').run(session.id,session.acesso_id);
    const next=db.prepare('SELECT acesso_id FROM sistema_sessao_contas WHERE sessao_id=? ORDER BY acesso_id LIMIT 1').get(session.id);
    if(next)return switchAccount(db,session,next.acesso_id);
    db.prepare('DELETE FROM sistema_sessao WHERE id=?').run(session.id);
  }
  res.clearCookie(sessionCookie,{...cookieOptions(req),maxAge:undefined});return {usuario:null,contas:[]};
}
export function authorize(db){
  return (req,res,next)=>{
    const session=readSession(db,req),{usuario}=sessionData(db,session);
    if(!usuario)return res.status(401).json({error:'Entre na sua conta para continuar.'});
    req.usuario=usuario;req.session=session;
    res.setHeader('Cache-Control','no-store');
    if(session.expires_at-Date.now()<sessionLifetime-24*60*60*1000){
      db.prepare('UPDATE sistema_sessao SET expires_at=? WHERE id=?').run(Date.now()+sessionLifetime,session.id);
      const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(`${sessionCookie}=`)).slice(sessionCookie.length+1);
      res.cookie(sessionCookie,raw,cookieOptions(req));
    }
    // Read-only exports use POST only for the potentially long list of filtered IDs.
    const read=['GET','HEAD'].includes(req.method)||(req.method==='POST'&&/^\/workflow\/extrato\/exportar\/?$/.test(req.path));
    if(usuario.acesso!=='operador'&&!read)return res.status(403).json({error:'Seu acesso permite apenas consultar e exportar.'});
    next();
  };
}
