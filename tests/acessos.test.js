import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase,migrate } from '../apps/system/backend/src/infrastructure/database/connection.js';
import { createApp } from '../apps/system/backend/src/app.js';
import { seed } from '../database/seed.js';
import { saveAccess } from '../apps/system/backend/src/modules/gerenciador/acessos/service.js';
import { hashPassword,verifyPassword } from '../apps/system/backend/src/modules/gerenciador/acessos/password.js';
import { confirmTransfer } from '../apps/system/backend/src/modules/workflow/rastreio/service.js';
async function fixture(t){
  const db=openDatabase(':memory:');migrate(db);seed(db);
  const operator=saveAccess(db,null,{login:'operador',senha:'teste123',acesso:'operador'}),viewer=saveAccess(db,null,{login:'leitor',senha:'teste456',acesso:'visualizador'});
  const server=createApp(db).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
  const url=`http://127.0.0.1:${server.address().port}/api`;
  const request=(path,{cookie,body,method='GET',headers={}}={})=>fetch(`${url}${path}`,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const login=async(name='operador',senha='teste123',cookie)=>{
    const response=await request('/sistema/sessao/entrar',{method:'POST',body:{login:name,senha},cookie});
    return {response,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  return {db,url,request,login,operator,viewer};
}
test('senhas usam salt aleatório e scrypt; não há hash ou senha nas respostas',async t=>{
  const a=hashPassword('teste123'),b=hashPassword('teste123');assert.notEqual(a,b);assert.ok(verifyPassword('teste123',a));assert.equal(verifyPassword('errada',a),false);
  const {request,login,db}=await fixture(t),auth=await login();
  assert.equal(auth.response.status,200);assert.match(auth.response.headers.get('set-cookie'),/HttpOnly/);assert.match(auth.response.headers.get('set-cookie'),/Max-Age=2592000/);assert.match(auth.response.headers.get('set-cookie'),/SameSite=Lax/);
  assert.doesNotMatch(JSON.stringify(auth.data),/senha|scrypt/);
  const users=await request('/gerenciador/acessos',{cookie:auth.cookie});assert.doesNotMatch(await users.text(),/senha|scrypt/);
  const token=auth.cookie.split('=')[1];assert.notEqual(db.prepare('SELECT token_hash FROM sistema_sessao').get().token_hash,token);
  assert.equal((await login('operador','errada')).response.status,401);assert.equal((await login('inexistente','errada')).response.status,401);
});
test('sem sessão não consulta dados; visualizador consulta/exporta mas não altera nenhuma área',async t=>{
  const {request,login,db}=await fixture(t),auth=await login('leitor','teste456');
  const areas=['/workflow/extrato','/workflow/saldos','/workflow/rastreio','/importacao/qprof','/importacao/extratos','/gerenciador/contas','/gerenciador/naturezas','/gerenciador/entidades','/gerenciador/acessos'];
  for(const area of areas){assert.equal((await request(area)).status,401,area);assert.equal((await request(area,{cookie:auth.cookie})).status,200,area);}
  for(const [path,method] of [['/workflow/extrato/batch','PUT'],['/workflow/extrato/1','DELETE'],['/workflow/extrato','PATCH'],['/workflow/extrato/importar','POST'],['/workflow/extrato/importar/conferir','POST'],['/workflow/rastreio/transferencias','POST'],['/workflow/rastreio/transferencias/1','PUT'],['/workflow/rastreio/transferencias/1/movimentacao','PATCH'],['/workflow/saldos/batch','PUT'],['/importacao/qprof','POST'],['/importacao/extratos/singulare-89727720','POST'],['/gerenciador/acessos','POST'],['/gerenciador/acessos/1','PUT'],['/gerenciador/acessos/1','DELETE'],['/gerenciador/contas/batch','PUT'],['/gerenciador/entidades/batch','PUT'],['/gerenciador/naturezas/batch','PUT']]){
    assert.equal((await request(path,{cookie:auth.cookie,method,body:{}})).status,403,path);
  }
  const spreadsheet=await request('/workflow/extrato/exportar',{cookie:auth.cookie,method:'POST',body:{ids:[1]}});assert.equal(spreadsheet.status,200);assert.match(spreadsheet.headers.get('content-type'),/spreadsheet/);
  const transfer=confirmTransfer(db,{extrato_id:1,itens:[101,102,103,104,105].map(qprof_titulo_id=>({qprof_titulo_id}))});
  const pdf=await request(`/workflow/rastreio/transferencias/${transfer.id}/pdf`,{cookie:auth.cookie});assert.equal(pdf.status,200);assert.equal(pdf.headers.get('content-type'),'application/pdf');
});
test('operador cadastra, altera e exclui acessos, mas preserva o último operador',async t=>{
  const {request,login,operator,viewer}=await fixture(t),{cookie}=await login();
  const create=await request('/gerenciador/acessos',{cookie,method:'POST',body:{login:'Novo',senha:'teste789',acesso:'visualizador'}});assert.equal(create.status,201);const user=await create.json();assert.equal(user.login,'novo');
  assert.equal((await login('NOVO','teste789')).response.status,200);
  assert.equal((await request('/gerenciador/acessos',{cookie,method:'POST',body:{login:'novo',senha:'teste123',acesso:'operador'}})).status,409);
  assert.equal((await request(`/gerenciador/acessos/${user.id}`,{cookie,method:'PUT',body:{login:'novo',senha:'',acesso:'operador'}})).status,200);
  assert.equal((await request(`/gerenciador/acessos/${user.id}`,{cookie,method:'DELETE'})).status,200);
  assert.equal((await request(`/gerenciador/acessos/${operator.id}`,{cookie,method:'DELETE'})).status,400);
  assert.equal((await request(`/gerenciador/acessos/${operator.id}`,{cookie,method:'PUT',body:{login:operator.login,acesso:'visualizador'}})).status,400);
  assert.equal((await request(`/gerenciador/acessos/${viewer.id}`,{cookie,method:'DELETE'})).status,200);
});
test('múltiplas contas exigem senha, trocam permissão e saem individualmente ou de todas',async t=>{
  const {request,login,operator,viewer}=await fixture(t),first=await login();
  assert.equal((await request('/sistema/sessao/trocar',{cookie:first.cookie,method:'POST',body:{acesso_id:viewer.id}})).status,401);
  assert.equal((await login('leitor','errada',first.cookie)).response.status,401);
  const second=await login('leitor','teste456',first.cookie);assert.equal(second.data.contas.length,2);assert.equal(second.data.usuario.id,viewer.id);assert.notEqual(first.cookie,second.cookie);
  assert.equal((await request('/workflow/extrato',{cookie:first.cookie})).status,401);
  assert.equal((await request('/gerenciador/acessos',{cookie:second.cookie,method:'POST',body:{}})).status,403);
  const switched=await request('/sistema/sessao/trocar',{cookie:second.cookie,method:'POST',body:{acesso_id:operator.id}});assert.equal((await switched.json()).usuario.id,operator.id);
  const logout=await request('/sistema/sessao/sair',{cookie:second.cookie,method:'POST',body:{}});const left=await logout.json();assert.equal(left.contas.length,1);assert.equal(left.usuario.id,viewer.id);
  assert.equal((await request('/sistema/sessao/trocar',{cookie:second.cookie,method:'POST',body:{acesso_id:operator.id}})).status,401);
  await request('/sistema/sessao/sair',{cookie:second.cookie,method:'POST',body:{todas:true}});assert.equal((await request('/workflow/extrato',{cookie:second.cookie})).status,401);
});
test('permissões são atuais, senha nova revoga sessões e sessão vencida não acessa dados',async t=>{
  const {db,request,login,viewer}=await fixture(t),auth=await login('leitor','teste456');
  saveAccess(db,viewer.id,{login:'leitor',acesso:'operador'});
  const create=await request('/gerenciador/acessos',{cookie:auth.cookie,method:'POST',body:{login:'outro',senha:'teste999',acesso:'visualizador'}});assert.equal(create.status,201);
  saveAccess(db,viewer.id,{login:'leitor',senha:'novasenha',acesso:'visualizador'});
  assert.equal((await request('/workflow/extrato',{cookie:auth.cookie})).status,401);
  assert.equal((await login('leitor','teste456')).response.status,401);
  const fresh=await login('leitor','novasenha');db.prepare('UPDATE sistema_sessao SET expires_at=0').run();
  assert.equal((await request('/workflow/extrato',{cookie:fresh.cookie})).status,401);
});
test('login bloqueia origem externa e excesso de tentativas; endpoint de foto não existe',async t=>{
  const {request,login}=await fixture(t),{cookie}=await login();
  assert.equal((await request('/sistema/sessao/entrar',{method:'POST',body:{login:'operador',senha:'teste123'},headers:{Origin:'https://externo.test'}})).status,403);
  assert.equal((await request('/sistema/sessao/foto',{cookie,method:'PUT',body:{foto:'data:image/svg+xml;base64,PHN2Zz4='}})).status,404);
  for(let i=0;i<20;i++)assert.equal((await login('operador','errada')).response.status,401);
  assert.equal((await login()).response.status,429);
});

test('sessão continua válida depois de recriar o servidor e renova o prazo de uso',async t=>{
  const {db,request,login}=await fixture(t),auth=await login();
  db.prepare('UPDATE sistema_sessao SET expires_at=?').run(Date.now()+24*60*60*1000);
  const renewed=await request('/workflow/extrato',{cookie:auth.cookie});assert.equal(renewed.status,200);assert.match(renewed.headers.get('set-cookie'),/Max-Age=2592000/);
  const restarted=createApp(db).listen(0,'127.0.0.1');await new Promise(r=>restarted.once('listening',r));
  try{const response=await fetch(`http://127.0.0.1:${restarted.address().port}/api/workflow/extrato`,{headers:{Cookie:auth.cookie}});assert.equal(response.status,200);}finally{await new Promise(r=>restarted.close(r));}
});
