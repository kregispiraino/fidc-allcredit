import { authenticatedFetch } from './helpers/auth.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, migrate } from '../apps/system/backend/src/infrastructure/database/connection.js';
import { seed } from '../database/seed.js';
import { confirmTransfer, updateTransfer, transferDetails, rastreioData } from '../apps/system/backend/src/modules/workflow/rastreio/service.js';
import { compositionPdf } from '../apps/system/backend/src/modules/workflow/rastreio/pdf.js';
import { saveRegistration, saveRegistrations, deleteRegistration } from '../apps/system/backend/src/modules/gerenciador/shared/service.js';
import { saveExtratoRows, deleteExtratoRow, classifyExtrato, extratoData } from '../apps/system/backend/src/modules/workflow/extrato/service.js';
import { parseCents } from '../apps/system/backend/src/shared/money.js';
import { createApp } from '../apps/system/backend/src/app.js';
import { controlRecords } from '../apps/system/backend/src/modules/workflow/rastreio/registros.js';
function fixture(t){const db=openDatabase(':memory:');migrate(db);seed(db);t.after(()=>db.close());return db;}
const payload={extrato_id:1,itens:[101,102,103,104,105].map(qprof_titulo_id=>({qprof_titulo_id}))};
const count=db=>db.prepare('SELECT count(*) n FROM workflow_rastreio_transferencias').get().n;
const itemPayload=item=>({id:item.id,qprof_titulo_id:item.qprof_titulo_id,tipo:item.tipo,titulo:item.titulo,cedente:item.cedente,sacado:item.sacado,valor_reais:(item.valor/100).toFixed(2)});

test('pendências novas seguem entrada, saída parcial, quitação e desvinculação sem dispensa histórica',t=>{
  const db=fixture(t);
  const movement=value=>saveExtratoRows(db,[{data:'2026-09-20',historico:'Ciclo novo',valor_reais:value,conta_id:2}])[0];
  const credit=confirmTransfer(db,{extrato_id:movement('100.00').id,itens:[{tipo:'titulo',titulo:'FLUXO-NOVO',valor_reais:'100.00'}]});
  const registro_id=credit.itens[0].registro_id;
  const current=()=>controlRecords(db).find(r=>r.id===registro_id);
  assert.equal(current().aguarda_saida,true);assert.equal(current().saldo_calculado,10000);assert.equal(current().pendencia_dispensa,null);
  const debit=value=>confirmTransfer(db,{extrato_id:movement(`-${value}`).id,itens:[{registro_id,valor_reais:value}]});
  const partial=debit('40.00');assert.equal(current().aguarda_saida,true);assert.equal(current().saldo_calculado,6000);
  const final=debit('60.00');assert.equal(current().aguarda_saida,false);assert.equal(current().situacao,'liquidado');
  updateTransfer(db,final.id,{versao:final.versao,itens:[]});assert.equal(current().aguarda_saida,true);assert.equal(current().saldo_calculado,6000);
  updateTransfer(db,partial.id,{versao:partial.versao,itens:[]});assert.equal(current().saldo_calculado,10000);
  updateTransfer(db,credit.id,{versao:credit.versao,itens:[]});assert.equal(current().aguarda_saida,false);
  debit('100.00');assert.equal(current().situacao,'sem_credito');assert.equal(current().aguarda_saida,false);
});

test('saída pela pendência mantém a identidade depois da substituição da base Qprof',t=>{
  const db=fixture(t),credit=confirmTransfer(db,payload);
  const ids=credit.itens.map(item=>item.registro_id);
  assert.ok(ids.every(id=>controlRecords(db).find(r=>r.id===id).aguarda_saida));
  db.prepare('DELETE FROM importacao_qprof_titulos').run();
  const debit=confirmTransfer(db,{extrato_id:11,itens:credit.itens.map(item=>({registro_id:item.registro_id,valor_reais:(item.valor/100).toFixed(2)}))});
  assert.deepEqual(debit.itens.map(item=>item.registro_id),ids);
  assert.ok(ids.every(id=>!controlRecords(db).find(r=>r.id===id).aguarda_saida));
  assert.ok(controlRecords(db).filter(r=>ids.includes(r.id)).every(r=>r.pendencia_dispensa===null));
});

test('cadastro rápido converte reais exatamente e aceita créditos/débitos',t=>{
  const db=fixture(t),before=count(db);assert.equal(parseCents('-1234.56'),-123456);assert.throws(()=>parseCents('10.001'),/duas casas/);
  const [row]=saveExtratoRows(db,[{data:'2026-09-20',historico:'Manual',valor_reais:'-12.34',conta_id:2}]);assert.equal(row.valor,-1234);assert.equal(count(db),before);
  deleteExtratoRow(db,row.id);
});
test('edição em lote reverte tudo quando um cadastro falha',t=>{
  const db=fixture(t);
  assert.throws(()=>saveRegistrations(db,'naturezas',[{nome:'Nova',classificacao:'Entrada',status:'active'},{nome:'Recebimento de títulos',classificacao:'Entrada',status:'active'}]),/UNIQUE/);
  assert.equal(db.prepare("SELECT id FROM gerenciador_naturezas WHERE nome='Nova'").get(),undefined);
  assert.throws(()=>saveExtratoRows(db,[{id:30,historico:'Não salvar'},{id:31,data:'2026-02-30'}]),/data válida/);
  assert.notEqual(db.prepare('SELECT historico FROM workflow_extrato WHERE id=30').get().historico,'Não salvar');
});
test('entrada e saída criam composições independentes sem alterar Qprof ou Extrato',t=>{
  const db=fixture(t),qprof=db.prepare('SELECT * FROM importacao_qprof_titulos').all(),extrato=db.prepare('SELECT * FROM workflow_extrato').all();
  const credit=confirmTransfer(db,payload),debit=confirmTransfer(db,{...payload,extrato_id:11});
  assert.equal(credit.tipo,'conciliacao');assert.equal(debit.tipo,'liquidacao');assert.equal(credit.itens.length,5);assert.equal(debit.itens.length,5);
  assert.deepEqual(db.prepare('SELECT * FROM importacao_qprof_titulos').all(),qprof);
  assert.deepEqual(db.prepare('SELECT * FROM workflow_extrato').all(),extrato);
  assert.ok(credit.itens.every(item=>!debit.itens.some(other=>other.id===item.id)));
});
test('snapshots persistem quando a base Qprof muda ou o título de origem é removido',t=>{
  const db=fixture(t),transfer=confirmTransfer(db,payload),snapshot=transfer.itens[0];
  db.prepare("UPDATE importacao_qprof_titulos SET numero='ALTERADO',sacado='Outro',valor=1 WHERE id=101").run();
  assert.deepEqual(transferDetails(db,transfer.id).itens[0],snapshot);
  db.prepare('DELETE FROM importacao_qprof_titulos WHERE id=101').run();
  const after=transferDetails(db,transfer.id).itens[0];assert.equal(after.qprof_titulo_id,null);assert.equal(after.titulo,snapshot.titulo);assert.equal(after.valor,snapshot.valor);
});
test('composição manual aceita parcial, tarifa e custas, sem gerar extratos ou títulos',t=>{
  const db=fixture(t),entries=db.prepare('SELECT count(*) n FROM workflow_extrato').get().n,titles=db.prepare('SELECT count(*) n FROM importacao_qprof_titulos').get().n;
  const transfer=confirmTransfer(db,{extrato_id:3,itens:[{qprof_titulo_id:101,tipo:'parcial',valor_reais:'18000.00',cedente:'Cedente exemplo'},
    {tipo:'tarifa',valor_reais:'40.00'},{tipo:'custas',valor_reais:'950.00'},{tipo:'custas',valor_reais:'-50.00'}]});
  assert.equal(transfer.total_composicao,1894000);assert.equal(transfer.itens[0].cedente,'Cedente exemplo');
  assert.equal(db.prepare('SELECT count(*) n FROM workflow_extrato').get().n,entries);assert.equal(db.prepare('SELECT count(*) n FROM importacao_qprof_titulos').get().n,titles);
});
test('salvar alterações atualiza apenas a composição e exclui itens desvinculados',t=>{
  const db=fixture(t),transfer=confirmTransfer(db,payload),removed=transfer.itens.at(-1),itens=transfer.itens.slice(0,-1).map(itemPayload);
  itens.push({tipo:'custas',titulo:'Ajuste',valor_reais:(removed.valor/100).toFixed(2)});itens[0].cedente='Cedente corrigido';
  const updated=updateTransfer(db,transfer.id,{versao:transfer.versao,itens});
  assert.equal(updated.versao,2);assert.equal(updated.itens[0].id,transfer.itens[0].id);assert.equal(updated.itens[0].cedente,'Cedente corrigido');
  assert.equal(db.prepare('SELECT id FROM workflow_rastreio_itens WHERE id=?').get(removed.id),undefined);
  assert.ok(db.prepare('SELECT id FROM importacao_qprof_titulos WHERE id=?').get(removed.qprof_titulo_id));
  assert.throws(()=>updateTransfer(db,transfer.id,{versao:transfer.versao,itens}),/mudou/);
});
test('remover todos os itens remove o rastreio, mantém extrato e libera nova composição',t=>{
  const db=fixture(t),transfer=confirmTransfer(db,payload);
  assert.equal(updateTransfer(db,transfer.id,{versao:transfer.versao,itens:[]}).deleted,true);
  assert.ok(db.prepare('SELECT id FROM workflow_extrato WHERE id=1').get());assert.equal(extratoData(db).extrato.find(row=>row.id===1).rastreio_id,null);
  assert.equal(db.prepare('SELECT count(*) n FROM workflow_rastreio_itens WHERE transferencia_id=?').get(transfer.id).n,0);
  assert.ok(confirmTransfer(db,payload));
});
test('status conciliado não bloqueia campos nem exclusão, inclusive com rastreio',t=>{
  const db=fixture(t),transfer=confirmTransfer(db,payload);
  saveExtratoRows(db,[{id:1,status:'reversal',data:'2026-09-22',historico:'Correção completa',valor_reais:'-100.00',conta_id:3}]);
  const changed=transferDetails(db,transfer.id);assert.equal(changed.tipo,'liquidacao');assert.equal(changed.data,'2026-09-22');assert.equal(changed.valor,10000);assert.notEqual(changed.diferenca,0);
  assert.throws(()=>updateTransfer(db,transfer.id,{versao:transfer.versao,itens:transfer.itens.map(itemPayload)}),/mudou/);
  classifyExtrato(db,{ids:[1,20],changes:{status:'pending'}});
  const qprof=db.prepare('SELECT count(*) n FROM importacao_qprof_titulos').get().n;
  deleteExtratoRow(db,1);assert.throws(()=>transferDetails(db,transfer.id),/não encontrada/);assert.equal(db.prepare('SELECT count(*) n FROM importacao_qprof_titulos').get().n,qprof);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('confirmação é independente dos status de controle do Extrato',t=>{
  const db=fixture(t);classifyExtrato(db,{ids:[1],changes:{status:'reversal'}});confirmTransfer(db,payload);
  assert.equal(db.prepare('SELECT status FROM workflow_extrato WHERE id=1').get().status,'reversal');
});
test('diferença de centavo, títulos inexistentes e tipos inválidos não gravam composição',t=>{
  const db=fixture(t),before=count(db);
  for(const itens of [[],[{qprof_titulo_id:999}], [{tipo:'invalido',valor_reais:'48325.70'}],[{tipo:'titulo',valor_reais:'48325.70'}],[{tipo:'tarifa',valor_reais:'48325.71'}]])assert.throws(()=>confirmTransfer(db,{extrato_id:1,itens}));
  assert.equal(count(db),before);
});
test('rollback restaura composição anterior se um item falhar durante a escrita',t=>{
  const db=fixture(t),transfer=confirmTransfer(db,payload),before=transfer.itens;
  db.exec("CREATE TRIGGER falha_item BEFORE INSERT ON workflow_rastreio_itens BEGIN SELECT RAISE(ABORT,'falha simulada'); END;");
  assert.throws(()=>updateTransfer(db,transfer.id,{versao:transfer.versao,itens:[{tipo:'custas',valor_reais:'48325.70'}]}),/falha simulada/);
  assert.deepEqual(transferDetails(db,transfer.id).itens,before);assert.equal(transferDetails(db,transfer.id).versao,1);
});
test('itens de outra transferência não podem ser apropriados e atualizações inválidas são atômicas',t=>{
  const db=fixture(t),a=confirmTransfer(db,payload),b=confirmTransfer(db,{...payload,extrato_id:11});
  assert.throws(()=>updateTransfer(db,b.id,{versao:b.versao,itens:a.itens.map(itemPayload)}),/não pertence/);
  assert.equal(transferDetails(db,b.id).itens.length,5);
});
test('contas e referências continuam validadas; cadastros usados são protegidos',t=>{
  const db=fixture(t);assert.throws(()=>confirmTransfer(db,{...payload,extrato_id:30}),/função da conta ativa/);
  assert.throws(()=>deleteRegistration(db,'entidades',1),/FOREIGN KEY/);
  assert.throws(()=>saveRegistration(db,'contas',null,{nome:'Bradesco 57420-1',funcao:'operacional',status:'active'}),/UNIQUE/);
  saveRegistrations(db,'contas',[{id:2,funcao:'operacional'}]);assert.throws(()=>confirmTransfer(db,payload),/função da conta ativa/);
});
test('persistência sobrevive à reabertura, migrations e seed são idempotentes',()=>{
  const folder=mkdtempSync(join(tmpdir(),'allcredit-')),file=join(folder,'test.sqlite');
  try{let db=openDatabase(file);migrate(db);seed(db);const transfer=confirmTransfer(db,payload);db.close();db=openDatabase(file);migrate(db);assert.equal(seed(db),false);assert.equal(transferDetails(db,transfer.id).itens.length,5);db.close();}finally{rmSync(folder,{recursive:true,force:true});}
});
test('API rejeita confirmação concorrente e entrega PDF real da composição',async t=>{
  const db=fixture(t),server=createApp(db).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}/api/workflow/rastreio/transferencias`;
  const fetch=await authenticatedFetch(db,url);
  const responses=await Promise.all([1,2].map(()=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})));
  assert.deepEqual(responses.map(row=>row.status).sort(),[201,409]);const transfer=await responses.find(row=>row.status===201).json();
  const response=await fetch(`${url}/${transfer.id}/pdf`);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.match(response.headers.get('content-disposition'),/\.pdf/);
  const pdf=Buffer.from(await response.arrayBuffer());assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,1);
});
test('PDF pagina composições extensas sem cortar itens ou gerar páginas de rodapé vazias',async t=>{
  const db=fixture(t);const itens=Array.from({length:80},(_,index)=>({tipo:'custas',titulo:`Item ${index+1}`,cedente:'Cedente com identificação extensa',sacado:'Sacado da composição',valor_reais:'10.00'}));
  saveExtratoRows(db,[{id:3,valor_reais:'800.00'}]);const transfer=confirmTransfer(db,{extrato_id:3,itens});
  const pdf=await compositionPdf(db,transfer.id),pages=(pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length;
  assert.ok(pages>=4&&pages<=8,`Número esperado de páginas: ${pages}`);
});

test('API aceita Ajuste e rejeita todos os tipos operacionais antigos',async t=>{
  const db=fixture(t);const {itemTypes}=await import('../apps/system/backend/src/modules/workflow/rastreio/registros.js');assert.deepEqual(itemTypes,['titulo','parcial','tarifa','custas','ajuste']);
  for(const tipo of ['ajuste_saldo','recebimento_sem_titulo','devolucao_ajuste','divergencia'])assert.throws(()=>confirmTransfer(db,{extrato_id:1,itens:[{tipo,valor_reais:'48325.70'}]}),/Tipo de item inválido/);
  const saved=confirmTransfer(db,{extrato_id:1,itens:[{tipo:'ajuste',cedente:'Observação do ajuste',valor_reais:'48325.70'}]});assert.equal(saved.itens[0].tipo,'ajuste');assert.equal(saved.itens[0].cedente,'Observação do ajuste');
});
