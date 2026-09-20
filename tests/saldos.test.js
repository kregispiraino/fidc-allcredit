import { authenticatedFetch } from './helpers/auth.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, migrate } from '../apps/system/backend/src/infrastructure/database/connection.js';
import { seed } from '../database/seed.js';
import { saveRegistration, saveRegistrations, deleteRegistration } from '../apps/system/backend/src/modules/gerenciador/shared/service.js';
import { saveExtratoRows, deleteExtratoRow, extratoData } from '../apps/system/backend/src/modules/workflow/extrato/service.js';
import { confirmTransfer, rastreioData } from '../apps/system/backend/src/modules/workflow/rastreio/service.js';
import { listSaldos, saveSaldos } from '../apps/system/backend/src/modules/workflow/saldos/service.js';
import { compositionState } from '../apps/system/frontend/src/features/workflow/rastreio/composition-state.js';
import { createApp } from '../apps/system/backend/src/app.js';
const fixture=t=>{const db=openDatabase(':memory:');migrate(db);seed(db);t.after(()=>db.close());return db;};
const account=(db,funcao,status='active')=>saveRegistration(db,'contas',null,{nome:`Conta ${funcao} ${status}`,funcao,status});
const movement=(conta_id,valor_reais)=>({conta_id,valor_reais,data:'2026-09-20',historico:'Movimentação para saldo'});
const balance=(db,id)=>db.prepare('SELECT * FROM workflow_saldos WHERE conta_id=?').get(id);

test('cadastro aceita apenas Operacional, Neutra e Rastreada',t=>{
  const db=fixture(t);
  for(const funcao of ['operacional','neutra','rastreada'])assert.equal(account(db,funcao).funcao,funcao);
  for(const funcao of ['conciliacao','liquidacao','invalida'])assert.throws(()=>account(db,funcao),/Função inválida/);
  assert.deepEqual(db.prepare('SELECT funcao FROM gerenciador_contas WHERE id<=3 ORDER BY id').all().map(row=>row.funcao),['operacional','rastreada','operacional']);
});

test('saldo Sistema acompanha inclusão, edição, troca de conta e exclusão, preservando saldo final',t=>{
  const db=fixture(t),a=account(db,'operacional'),b=account(db,'rastreada');
  assert.equal(balance(db,a.id).saldo_sistema,0);
  saveSaldos(db,[{id:a.id,saldo_final_reais:'150.55'}]);
  const [credit,debit]=saveExtratoRows(db,[movement(a.id,'100.15'),movement(a.id,'-20.10')]);
  assert.equal(balance(db,a.id).saldo_sistema,8005);
  saveExtratoRows(db,[{id:credit.id,valor_reais:'75.20',status:'reconciled'}]);
  assert.equal(balance(db,a.id).saldo_sistema,5510);
  saveExtratoRows(db,[{id:debit.id,conta_id:b.id}]);
  assert.equal(balance(db,a.id).saldo_sistema,7520);assert.equal(balance(db,b.id).saldo_sistema,-2010);
  deleteExtratoRow(db,credit.id);assert.equal(balance(db,a.id).saldo_sistema,0);
  assert.equal(balance(db,a.id).saldo_final,15055);assert.equal(balance(db,a.id).saldo_banco,null);
  for(const row of listSaldos(db))assert.equal(row.saldo_sistema,db.prepare('SELECT COALESCE(SUM(valor),0) total FROM workflow_extrato WHERE conta_id=?').get(row.conta_id).total);
  assert.throws(()=>saveExtratoRows(db,[movement(a.id,'10'),{...movement(a.id,'10'),data:'inválida'}]));
  assert.equal(balance(db,a.id).saldo_sistema,0,'rollback também desfaz atualização do saldo');
});
test('todas as funções ativas têm saldo; neutra não permite novas movimentações nem aparece no Extrato',t=>{
  const db=fixture(t),neutral=account(db,'neutra'),inactive=account(db,'neutra','inactive');
  assert.ok(listSaldos(db).some(row=>row.conta_id===neutral.id));
  assert.ok(!listSaldos(db).some(row=>row.conta_id===inactive.id));
  assert.throws(()=>saveExtratoRows(db,[movement(neutral.id,'10')]),/neutras/);
  const existing=db.prepare('SELECT * FROM workflow_extrato WHERE conta_id=1').all();
  saveRegistrations(db,'contas',[{id:1,funcao:'neutra'}]);
  assert.ok(!extratoData(db).contas.some(row=>row.id===1));assert.ok(!extratoData(db).extrato.some(row=>row.conta_id===1));
  assert.deepEqual(db.prepare('SELECT * FROM workflow_extrato WHERE conta_id=1').all(),existing,'não apaga histórico ao alterar função');
  saveRegistrations(db,'contas',[{id:1,funcao:'operacional'}]);
  assert.equal(extratoData(db).extrato.filter(row=>row.conta_id===1).length,existing.length);
  saveRegistrations(db,'contas',[{id:neutral.id,status:'inactive'}]);
  assert.ok(!listSaldos(db).some(row=>row.conta_id===neutral.id));
  assert.throws(()=>saveSaldos(db,[{id:neutral.id,saldo_final_reais:'0'}]),/ativa/);
  deleteRegistration(db,'contas',neutral.id);assert.equal(balance(db,neutral.id),undefined);
});
test('saldo final admite zero, negativo e vazio, valida centavos e edita em lote atomicamente',t=>{
  const db=fixture(t);
  for(const [value,expected] of [['0',0],['-1234.56',-123456],['',null],['10.01',1001]]){
    saveSaldos(db,[{id:1,saldo_final_reais:value}]);assert.equal(balance(db,1).saldo_final,expected);
  }
  db.exec("UPDATE workflow_saldos SET updated_at='2000-01-01 00:00:00' WHERE conta_id=1");
  saveSaldos(db,[{id:1,saldo_final_reais:'5.55'}]);assert.notEqual(balance(db,1).updated_at,'2000-01-01 00:00:00');
  for(const value of ['1.001','90000000000.01','NaN'])assert.throws(()=>saveSaldos(db,[{id:1,saldo_final_reais:value}]));
  assert.throws(()=>saveSaldos(db,[{id:1,saldo_final_reais:'999'},{id:9999,saldo_final_reais:'10'}]));
  assert.equal(balance(db,1).saldo_final,555);
  assert.throws(()=>saveSaldos(db,[{id:1,saldo_final_reais:'1',saldo_banco:100}]),/Apenas/);
});
test('filas usam todas as contas ativas por função e sinal; operacional e neutra não entram',t=>{
  const db=fixture(t),extra=account(db,'rastreada');
  const [credit,debit]=saveExtratoRows(db,[movement(extra.id,'10'),movement(extra.id,'-10')]);
  const queue=tab=>compositionState({state:{tab},pageState:{},data:rastreioData(db)}).entries;
  assert.ok(queue('conciliacao').some(row=>row.id===credit.id));assert.ok(queue('liquidacao').some(row=>row.id===debit.id));
  assert.ok(queue('liquidacao').some(row=>row.id===11));
  assert.ok(!queue('conciliacao').some(row=>row.conta_id===1));
  assert.equal(confirmTransfer(db,{extrato_id:debit.id,itens:[{tipo:'custas',valor_reais:'10'}]}).tipo,'liquidacao');
  const [operational]=saveExtratoRows(db,[movement(3,'-10')]);
  assert.ok(!queue('liquidacao').some(row=>row.conta_id===3));
  assert.throws(()=>confirmTransfer(db,{extrato_id:operational.id,itens:[{tipo:'custas',valor_reais:'10'}]}),/Rastreada/);
  saveRegistrations(db,'contas',[{id:extra.id,status:'inactive'}]);
  assert.ok(!queue('conciliacao').some(row=>row.id===credit.id));
  assert.throws(()=>confirmTransfer(db,{extrato_id:credit.id,itens:[{tipo:'custas',valor_reais:'10'}]}),/ativa/);
});
test('API de Saldos lista contas e persiste apenas saldo final',async t=>{
  const db=fixture(t),server=createApp(db).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}/api/workflow/saldos`;
  const fetch=await authenticatedFetch(db,url);
  assert.equal((await (await fetch(url)).json()).saldos.length,3);
  const put=items=>fetch(`${url}/batch`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({items})});
  assert.equal((await put([{id:1,saldo_final_reais:'0'}])).status,200);
  assert.equal((await put([{id:1,saldo_final_reais:'1',saldo_sistema:5}])).status,400);
  assert.equal(balance(db,1).saldo_final,0);
});
