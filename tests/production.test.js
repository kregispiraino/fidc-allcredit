import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runtimeConfig } from '../apps/system/backend/src/infrastructure/http/config.js';
import { openDatabase,migrate } from '../apps/system/backend/src/infrastructure/database/connection.js';
import { createApp } from '../apps/system/backend/src/app.js';
import { saveAccess } from '../apps/system/backend/src/modules/gerenciador/acessos/service.js';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,rmSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const env={NODE_ENV:'production',ALLCREDIT_DB:'/data/allcredit.sqlite',APP_ORIGIN:'https://fidc.example.com',TRUST_PROXY:'1'};
test('produção exige HTTPS e arquivo persistente; Railway exige volume correto',()=>{
  assert.throws(()=>runtimeConfig({NODE_ENV:'production'}),/APP_ORIGIN/);
  assert.throws(()=>runtimeConfig({...env,APP_ORIGIN:'http://fidc.example.com'}),/HTTPS/);
  assert.throws(()=>runtimeConfig({...env,ALLCREDIT_DB:'database/test.sqlite'}),/absoluto/);
  assert.throws(()=>runtimeConfig({...env,RAILWAY_ENVIRONMENT_ID:'teste'}),/volume/);
  assert.throws(()=>runtimeConfig({...env,RAILWAY_ENVIRONMENT_ID:'teste',RAILWAY_VOLUME_MOUNT_PATH:'/outro'}),/dentro/);
  assert.equal(runtimeConfig({...env,APP_ORIGIN:'',RAILWAY_PUBLIC_DOMAIN:'fidc.up.railway.app'}).origin,'https://fidc.up.railway.app');
  assert.throws(()=>runtimeConfig({...env,TRUST_PROXY:'true'}),/TRUST_PROXY/);
});
test('Railway: health público sem dados, cookie Secure, origem validada e CSP',async t=>{
  const db=openDatabase(':memory:');migrate(db);saveAccess(db,null,{login:'operador',senha:'senha-de-teste',acesso:'operador'});
  const server=createApp(db,{env}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  const health=await fetch(`${base}/healthz`);assert.equal(health.status,200);assert.deepEqual(await health.json(),{status:'ok'});
  assert.equal((await fetch(`${base}/api/workflow/extrato`)).status,401);
  const send=origin=>fetch(`${base}/api/sistema/sessao/entrar`,{method:'POST',headers:{Origin:origin,'X-Forwarded-Proto':'https','Content-Type':'application/json'},body:JSON.stringify({login:'operador',senha:'senha-de-teste'})});
  assert.equal((await send('https://outro.example.com')).status,403);
  const login=await send(env.APP_ORIGIN);assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/Secure/);assert.match(login.headers.get('set-cookie'),/HttpOnly/);
  const page=await fetch(base);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.doesNotMatch(await page.text(),/<script>(?!<)/);
  assert.equal((await fetch(`${base}/database/allcredit.sqlite`)).status,404);
});
test('CLI cria acesso sem senha no output; backup preserva credenciais e integridade',t=>{
  const dir=mkdtempSync(join(tmpdir(),'allcredit-production-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const path=join(dir,'main.sqlite'),copy=join(dir,'backup.sqlite');
  const result=spawnSync(process.execPath,['scripts/create-access.js'],{env:{...process.env,ALLCREDIT_DB:path},input:JSON.stringify({login:'operador',senha:'senha-de-teste'}),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.doesNotMatch(result.stdout,/senha-de-teste/);
  const backup=spawnSync(process.execPath,['scripts/backup.js',copy],{env:{...process.env,ALLCREDIT_DB:path},encoding:'utf8'});assert.equal(backup.status,0,backup.stderr);assert.ok(existsSync(copy));
  const db=openDatabase(copy);try{assert.equal(db.prepare('SELECT login FROM gerenciador_acessos').get().login,'operador');assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{db.close();}
});
